# frozen_string_literal: true

# SPACENODE para SketchUp — núcleo do plugin.
#
# Regras de arquitetura deste arquivo:
# - TODO HTTP via Sketchup::Http::Request (assíncrono, callback na main
#   thread). Nunca Thread.new: a API do SketchUp não é thread-safe e o GVL
#   pode congelar o request até o usuário mexer o mouse.
# - Referências dos requests ficam em @http_requests até o callback — sem
#   isso o GC mata o request no meio e o download falha em silêncio.
# - Sintaxe compatível com Ruby 2.5 (sem rescue inline em bloco do…end):
#   o gate de versão em runtime só funciona se o arquivo PARSEAR em
#   SketchUp antigo.
# - A imagem sobe por upload direto ao Storage (sign → PUT → sourceKey);
#   o corpo JSON da Vercel tem teto de 4,5 MB e responde 413 em texto puro.

require 'sketchup.rb'
require 'base64'
require 'json'
require 'securerandom'
require 'time'
require 'tmpdir'
require 'uri'

module SpaceNode
  module SketchUp
    extend self

    VERSION = '0.2.0'
    PREFERENCES_KEY = 'com.spacenode.sketchup'
    DEFAULT_API_BASE_URL = 'https://spacenode.app'
    MIN_SKETCHUP_MAJOR = 21          # Ruby 2.7+; recomendado 2024+
    CATALOG_TTL_SECONDS = 6 * 3600
    GENERATE_TIMEOUT_SECONDS = 320   # /api/generate tem maxDuration=300
    SILENT_AUTH_TIMEOUT_SECONDS = 25

    # Lado maior da captura por resolução de saída. O servidor normaliza em
    # 4096 px — capturar menos que isso pra 2K/4K joga fora o sinal
    # geométrico que o motor de fidelidade precisa.
    CAPTURE_EDGE = { 'hd' => 2048, '2k' => 3072, '4k' => 4096 }.freeze

    class ApiError < StandardError
      attr_reader :status

      def initialize(message, status = nil)
        super(message)
        @status = status
      end
    end

    # ── Entrada ──────────────────────────────────────────────────────────────

    def activate
      unless supported_version?
        ::UI.messagebox(
          "O SPACENODE precisa do SketchUp 20#{MIN_SKETCHUP_MAJOR} ou mais novo.\n" \
          "Recomendamos SketchUp 2024 ou superior."
        )
        return
      end
      cleanup_stale_captures
      show_dialog
    end

    def supported_version?
      ::Sketchup.version.to_i >= MIN_SKETCHUP_MAJOR
    rescue StandardError
      true
    end

    def show_dialog
      if @dialog && @dialog.respond_to?(:visible?) && @dialog.visible?
        @dialog.bring_to_front if @dialog.respond_to?(:bring_to_front)
        send_state
        return
      end

      dialog = ::UI::HtmlDialog.new(
        :dialog_title => 'SPACENODE',
        :preferences_key => PREFERENCES_KEY,
        :scrollable => false,
        :resizable => true,
        :width => 440,
        :height => 780,
        :min_width => 380,
        :min_height => 560,
        :style => dialog_style
      )
      attach_callbacks(dialog)
      dialog.set_file(File.join(__dir__, 'dialog.html'))
      dialog.set_on_closed do
        # Só limpa se ainda somos o dialog corrente (um dialog antigo fechando
        # tarde não pode anular o novo).
        @dialog = nil if @dialog.equal?(dialog)
      end
      @dialog = dialog
      dialog.show
    end

    def dialog_style
      defined?(::UI::HtmlDialog::STYLE_DIALOG) ? ::UI::HtmlDialog::STYLE_DIALOG : 1
    end

    def attach_callbacks(dialog)
      dialog.add_action_callback('ready') do |_ctx|
        begin
          on_panel_ready
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('captureViewport') do |_ctx|
        begin
          handle_capture
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('generate') do |_ctx, raw|
        begin
          handle_generate(raw)
        rescue StandardError => e
          # NUNCA fail_generation aqui: um erro deste callback com outra
          # geração em andamento soltaria o lock dela (cobrança dupla).
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('refreshCatalog') do |_ctx|
        begin
          refresh_catalog
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('cancelGenerate') do |_ctx|
        begin
          handle_cancel
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('connect') do |_ctx|
        begin
          show_auth_dialog(false)
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('disconnect') do |_ctx|
        clear_session
        send_state
      end
      dialog.add_action_callback('checkSession') do |_ctx|
        begin
          check_session
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('fetchHistory') do |_ctx, raw|
        begin
          fetch_history(raw)
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('saveResult') do |_ctx, raw|
        begin
          save_result_to_disk(raw)
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('persistState') do |_ctx, raw|
        write_json_default('panel_state', raw.to_s)
      end
      dialog.add_action_callback('saveSettings') do |_ctx, raw|
        begin
          handle_save_settings(raw)
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('openUrl') do |_ctx, url|
        open_url(url)
      end
    end

    def on_panel_ready
      send_state
      ensure_catalog
      check_session if authenticated?
    end

    # ── HTTP assíncrono (Sketchup::Http) ────────────────────────────────────

    def http_request(method, path_or_url, options = {})
      url = path_or_url.start_with?('http') ? path_or_url : "#{api_base_url}#{path_or_url}"
      http_method = resolve_http_method(method)
      request = ::Sketchup::Http::Request.new(url, http_method)

      headers = { 'Accept' => 'application/json', 'User-Agent' => "SPACENODE SketchUp/#{VERSION}" }
      headers['Authorization'] = "Bearer #{access_token}" unless options[:auth] == false
      headers['Content-Type'] = options[:content_type] if options[:content_type]
      headers.merge!(options[:headers]) if options[:headers]
      request.headers = headers
      request.body = options[:body] if options[:body]

      @http_requests ||= []
      @http_requests << request

      request.start do |req, response|
        @http_requests.delete(req)
        begin
          yield response
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      request
    end

    def resolve_http_method(method)
      case method
      when :post then ::Sketchup::Http::POST
      when :put  then ::Sketchup::Http::PUT
      else ::Sketchup::Http::GET
      end
    end

    def json_request(method, path, body, on_error, &on_success)
      options = {}
      if body
        options[:body] = JSON.generate(body)
        options[:content_type] = 'application/json'
      end
      http_request(method, path, options) do |response|
        handle_json_response(response, on_error, &on_success)
      end
    end

    def handle_json_response(response, on_error)
      status = response.status_code.to_i
      body = response.body.to_s
      data = nil
      begin
        data = body.empty? ? {} : JSON.parse(body)
      rescue JSON::ParserError
        data = nil
      end

      if status >= 200 && status < 300 && data
        yield data
        return
      end

      message =
        if data && (data['error'] || data['message'])
          data['error'] || data['message']
        elsif status == 413
          'Imagem grande demais pro envio direto. Tente novamente.'
        elsif status.zero?
          'Não foi possível conectar à SPACENODE. Verifique sua internet.'
        else
          "Erro HTTP #{status}"
        end
      error = ApiError.new(message, status)
      handle_auth_failure if status == 401
      on_error.call(error)
    end

    def handle_auth_failure
      clear_session
      send_state
    end

    # ── Sessão ───────────────────────────────────────────────────────────────

    def show_auth_dialog(silent)
      close_auth_dialog

      @auth_nonce = SecureRandom.hex(16)
      @auth_silent = silent

      # O dialog silencioso NÃO usa preferences_key: HtmlDialog persiste
      # posição por key, e a posição fora da tela do modo silencioso
      # envenenaria a geometria do dialog de Conectar visível.
      dialog_options = {
        :dialog_title => 'Conectar SPACENODE',
        :scrollable => false,
        :resizable => true,
        :width => 440,
        :height => 580,
        :min_width => 380,
        :min_height => 480,
        :style => dialog_style
      }
      dialog_options[:preferences_key] = "#{PREFERENCES_KEY}.auth" unless silent
      dialog = ::UI::HtmlDialog.new(dialog_options)

      dialog.add_action_callback('receiveSpaceNodeSession') do |_ctx, raw|
        begin
          receive_session(raw)
        rescue StandardError => e
          emit_error(e.message)
        end
      end

      dialog.set_url("#{api_base_url}/sketchup/connect?nonce=#{@auth_nonce}")
      @auth_dialog = dialog
      dialog.show

      # Renovação silenciosa: mesma página, janela movida pra fora da área
      # visível DEPOIS do show (antes, a restauração de geometria competiria
      # com o set_position). O CEF guarda a sessão web do usuário; o
      # supabase-js renova o access token e a página entrega sem interação.
      dialog.set_position(20_000, 20_000) if silent && dialog.respond_to?(:set_position)

      if silent
        ::UI.start_timer(SILENT_AUTH_TIMEOUT_SECONDS, false) do
          if @auth_dialog.equal?(dialog)
            close_auth_dialog
            had_pending = !@pending_generate.nil?
            @pending_generate = nil
            emit_error('Sua sessão expirou. Conecte novamente.', true, had_pending)
          end
        end
      end
    end

    def receive_session(raw)
      payload = parse_json(raw)

      # O nonce foi gerado aqui e ecoado pela página — nenhuma outra página
      # carregada no dialog consegue injetar uma sessão.
      nonce = payload['nonce'].to_s
      if @auth_nonce.nil? || nonce.empty? || nonce != @auth_nonce
        close_auth_dialog
        raise 'Sessão recusada: origem não confiável.'
      end
      @auth_nonce = nil

      token = payload['accessToken'].to_s
      raise 'Sessão inválida recebida da SPACENODE.' if token.empty?

      ::Sketchup.write_default(PREFERENCES_KEY, 'access_token', token)
      ::Sketchup.write_default(PREFERENCES_KEY, 'expires_at', payload['expiresAt'].to_i)
      ::Sketchup.write_default(PREFERENCES_KEY, 'user_email', payload['userEmail'].to_s)

      close_auth_dialog
      send_state
      ensure_catalog

      pending = @pending_generate
      @pending_generate = nil
      if pending
        run_generation(pending)
      else
        check_session
      end
    end

    def close_auth_dialog
      dialog = @auth_dialog
      @auth_dialog = nil
      dialog.close if dialog && dialog.respond_to?(:close)
    rescue StandardError
      nil
    end

    def clear_session
      ::Sketchup.write_default(PREFERENCES_KEY, 'access_token', '')
      ::Sketchup.write_default(PREFERENCES_KEY, 'expires_at', 0)
      ::Sketchup.write_default(PREFERENCES_KEY, 'user_email', '')
    end

    def authenticated?
      !access_token.empty?
    end

    # Token utilizável sem renovar? expiresAt desconhecido conta como VENCIDO
    # (o contrário — "válido pra sempre" — era o bug B4 do MVP).
    def session_fresh?
      return false if access_token.empty?

      expires_at = ::Sketchup.read_default(PREFERENCES_KEY, 'expires_at', 0).to_i
      expires_at > Time.now.to_i + 60
    end

    def access_token
      ::Sketchup.read_default(PREFERENCES_KEY, 'access_token', '').to_s
    end

    def check_session
      return unless authenticated?

      json_request(:get, '/api/sketchup/session', nil, method(:emit_api_error)) do |data|
        @balance = data['balance']
        emit('session', data)
        send_state
      end
    end

    def emit_api_error(error)
      emit_error(error.message, error.respond_to?(:status) && error.status == 401)
    end

    # ── Catálogo (motores, custos, presets — fonte única remota) ───────────

    def ensure_catalog
      cached = cached_catalog
      if cached
        emit('catalog', cached)
        return
      end
      refresh_catalog
    end

    def refresh_catalog
      return unless authenticated?

      on_fail = proc do |error|
        # Sem catálogo o painel fica sem presets/custos — o painel mostra
        # aviso com ação de tentar de novo (callback refreshCatalog).
        emit('catalogError', { :message => error.message })
      end
      json_request(:get, '/api/sketchup/catalog', nil, on_fail) do |data|
        @catalog = data
        write_json_default('catalog_json', JSON.generate(data))
        begin
          ::Sketchup.write_default(PREFERENCES_KEY, 'catalog_at', Time.now.to_i)
        rescue StandardError
          nil
        end
        emit('catalog', data)
      end
    end

    def cached_catalog
      return @catalog if @catalog

      raw = read_json_default('catalog_json')
      at = ::Sketchup.read_default(PREFERENCES_KEY, 'catalog_at', 0).to_i
      return nil if raw.nil? || raw.empty?
      return nil if Time.now.to_i - at > CATALOG_TTL_SECONDS

      @catalog = JSON.parse(raw)
    rescue StandardError
      nil
    end

    # write_default/read_default têm bugs históricos de round-trip com aspas
    # e barras invertidas (pior no macOS/plist) — JSON vai SEMPRE em Base64.
    def write_json_default(key, json)
      ::Sketchup.write_default(PREFERENCES_KEY, key, Base64.strict_encode64(json.to_s))
    rescue StandardError
      nil
    end

    def read_json_default(key)
      raw = ::Sketchup.read_default(PREFERENCES_KEY, key, '').to_s
      return nil if raw.empty?

      Base64.strict_decode64(raw).force_encoding('UTF-8')
    rescue StandardError
      nil
    end

    # ── Captura ──────────────────────────────────────────────────────────────

    def handle_capture
      path = capture_viewport('2k')
      @last_capture_path = path
      emit('capture', capture_event_payload(path))
    end

    def capture_event_payload(path)
      size = @last_capture_size || [4, 3]
      {
        :ok => true,
        :imageDataUrl => thumbnail_data_url(path),
        :width => size[0],
        :height => size[1],
        :capturedAt => Time.now.iso8601
      }
    end

    def capture_viewport(resolution)
      model = ::Sketchup.active_model
      raise 'Nenhum modelo aberto no SketchUp.' unless model

      view = model.active_view
      vpw = [view.vpwidth.to_i, 1].max
      vph = [view.vpheight.to_i, 1].max

      target_edge = CAPTURE_EDGE[resolution.to_s] || CAPTURE_EDGE['2k']
      scale = target_edge.to_f / [vpw, vph].max
      scale = 1.0 if scale < 1.0
      scale = 4.0 if scale > 4.0
      width = [(vpw * scale).round, 1].max
      height = [(vph * scale).round, 1].max

      path = File.join(Dir.tmpdir, "spacenode-viewport-#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{SecureRandom.hex(3)}.png")

      # Higiene: a grade laranja de um plano de seção ativo entraria na imagem
      # e viraria artefato no render. Esconde só durante a captura e RESTAURA
      # MANUALMENTE — mudanças em RenderingOptions não são registradas em
      # operações (abort_operation não as reverte; só viraram undoáveis no
      # SketchUp 2026, e apenas no nível de Page). Sem operação: a mudança
      # não cria passo de undo de qualquer forma.
      rendering = model.rendering_options
      hide_planes = false
      begin
        hide_planes = rendering['DisplaySectionPlanes'] ? true : false
      rescue StandardError
        hide_planes = false
      end

      begin
        rendering['DisplaySectionPlanes'] = false if hide_planes

        options = {
          :filename => path,
          :width => width,
          :height => height,
          :antialias => true
        }
        options[:scale_factor] = scale if scale > 1.0

        ok = view.write_image(options)
        raise 'Não foi possível capturar a vista atual.' unless ok && File.exist?(path)

        # Um viewport 4K em PNG pode passar do teto de 15 MB da área de
        # upload — cai pra JPEG de alta qualidade antes de falhar.
        if File.size(path) > 14_000_000
          jpg = path.sub(/\.png\z/, '.jpg')
          view.write_image(
            :filename => jpg,
            :width => width,
            :height => height,
            :antialias => true,
            :compression => 0.92
          )
          if File.exist?(jpg)
            begin
              File.delete(path)
            rescue StandardError
              nil
            end
            path = jpg
          end
        end

        # Segunda captura pequena só pro preview do painel — nunca injetamos
        # o arquivo cheio (megabytes de base64 dentro de execute_script
        # travam o CEF).
        preview = "#{path}.preview.jpg"
        preview_scale = 900.0 / [vpw, vph].max
        preview_scale = 1.0 if preview_scale > 1.0
        view.write_image(
          :filename => preview,
          :width => [(vpw * preview_scale).round, 1].max,
          :height => [(vph * preview_scale).round, 1].max,
          :antialias => true,
          :compression => 0.85
        )
        @last_preview_path = File.exist?(preview) ? preview : nil
      ensure
        if hide_planes
          begin
            rendering['DisplaySectionPlanes'] = true
          rescue StandardError
            nil
          end
        end
      end

      @last_capture_size = [width, height]
      @last_capture_mime = path.end_with?('.jpg') ? 'image/jpeg' : 'image/png'
      path
    end

    def thumbnail_data_url(path)
      preview = @last_preview_path
      source = preview && File.exist?(preview) ? preview : path
      mime = source.end_with?('.jpg') ? 'image/jpeg' : 'image/png'
      "data:#{mime};base64,#{Base64.strict_encode64(File.binread(source))}"
    end

    def cleanup_stale_captures
      pattern = File.join(Dir.tmpdir, 'spacenode-viewport-*')
      cutoff = Time.now - (24 * 3600)
      Dir.glob(pattern).each do |file|
        begin
          File.delete(file) if File.mtime(file) < cutoff
        rescue StandardError
          nil
        end
      end
    rescue StandardError
      nil
    end

    # ── Geração ──────────────────────────────────────────────────────────────

    def handle_generate(raw)
      payload = parse_json(raw)
      unless authenticated?
        emit_error('Conecte sua conta SPACENODE primeiro.', true, true)
        return
      end
      if @generating
        # Sem tocar no lock da geração em andamento (generation: false).
        emit_error('Já existe uma geração em andamento.')
        return
      end

      unless session_fresh?
        @pending_generate = payload
        emit('status', { :stage => 'auth', :message => 'Renovando sessão…' })
        show_auth_dialog(true)
        return
      end

      run_generation(payload)
    end

    def run_generation(payload)
      if @generating
        emit_error('Já existe uma geração em andamento.')
        return
      end

      @generating = true
      # Época invalida callbacks de gerações antigas/canceladas: cada
      # continuação assíncrona confere a época antes de seguir.
      @generation_epoch = (@generation_epoch || 0) + 1
      @generation_started_at = Time.now

      emit('status', { :stage => 'capture', :message => 'Capturando a vista…' })
      resolution = payload['resolution'].to_s
      path = capture_viewport(resolution)
      @last_capture_path = path
      emit('capture', capture_event_payload(path))

      upload_capture(path, payload)
    rescue StandardError => e
      fail_generation(e.message)
    end

    # Continuação de geração ainda válida? (não cancelada/substituída)
    def generation_alive?(epoch)
      @generating && epoch == @generation_epoch
    end

    def upload_capture(path, payload)
      epoch = @generation_epoch
      size = File.size(path)
      mime = @last_capture_mime || 'image/png'
      emit('status', { :stage => 'upload', :message => 'Enviando o projeto…' })

      sign_body = {
        :area => 'render-source',
        :contentType => mime,
        :sizeBytes => size
      }
      json_request(:post, '/api/uploads/sign', sign_body, generation_error_handler_for(epoch)) do |sign|
        next unless generation_alive?(epoch)

        upload_url = sign['uploadUrl'].to_s
        key = sign['key'].to_s
        if upload_url.empty? || key.empty?
          fail_generation('Não foi possível preparar o envio da imagem.')
        else
          put_capture(path, mime, upload_url, key, payload)
        end
      end
    end

    def put_capture(path, mime, upload_url, key, payload)
      epoch = @generation_epoch
      binary = File.binread(path)
      http_request(:put, upload_url, :body => binary, :content_type => mime, :auth => false) do |response|
        next unless generation_alive?(epoch)

        status = response.status_code.to_i
        if status >= 200 && status < 300
          begin
            File.delete(path) if File.exist?(path)
          rescue StandardError
            nil
          end
          request_generation(key, payload)
        else
          fail_generation('Falha no envio da imagem. Verifique sua internet e tente de novo.')
        end
      end
    end

    def request_generation(source_key, payload)
      epoch = @generation_epoch
      body = build_generate_payload(source_key, payload)
      emit('status', { :stage => 'generate', :message => 'Gerando na SPACENODE…' })

      request = json_request(:post, '/api/generate', body, generation_error_handler_for(epoch)) do |data|
        finish_generation(data) if generation_alive?(epoch)
      end
      @generate_request = request

      ::UI.start_timer(GENERATE_TIMEOUT_SECONDS, false) do
        if generation_alive?(epoch) && @generate_request.equal?(request)
          begin
            request.cancel
          rescue StandardError
            nil
          end
          reconcile_lost_generation
        end
      end
    end

    def build_generate_payload(source_key, payload)
      project_type = payload['projectType'] == 'exterior' ? 'exterior' : 'interior'

      body = {
        :sourceKey => source_key,
        :projectType => project_type,
        :segment => payload['segment'].to_s,
        :environment => payload['environment'].to_s,
        :lighting => payload['lighting'].to_s,
        :background => payload['background'].to_s.empty? ? 'Preservar Original' : payload['background'].to_s,
        :sceneElements => Array(payload['sceneElements']).map(&:to_s),
        :fidelityLevel => %w[maximum balanced creative].include?(payload['fidelityLevel']) ? payload['fidelityLevel'] : 'maximum',
        :engine => payload['engine'].to_s,
        :resolution => payload['resolution'].to_s
      }

      prompt = payload['prompt'].to_s.strip
      body[:refinementText] = prompt unless prompt.empty?

      # Variação: o render anterior vira âncora de materiais/atmosfera e o
      # refino passa a ser cirúrgico (contrato do /api/generate). O painel
      # manda a URL explícita — @last_result é só fallback e não existe após
      # reiniciar o SketchUp (o resultado restaurado do .skp fica só no JS).
      if payload['useAnchor']
        anchor = payload['anchorUrl'].to_s
        anchor = @last_result && @last_result[:outputUrl].to_s if anchor.empty?
        if anchor && anchor =~ %r{\Ahttps?://}
          body[:anchorUrl] = anchor
        end
      end
      seed = payload['seed']
      body[:seed] = seed.to_i if seed.is_a?(Numeric) || seed.to_s =~ /\A\d+\z/

      body
    end

    def generation_error_handler_for(epoch)
      proc do |error|
        if generation_alive?(epoch)
          status = error.respond_to?(:status) ? error.status : nil
          if status.nil? || status.to_i.zero?
            # Queda de rede DEPOIS do POST: o servidor pode ter cobrado e gerado.
            reconcile_lost_generation
          else
            fail_generation(error.message, status == 401)
          end
        end
      end
    end

    def finish_generation(data)
      return unless @generating

      @generating = false
      @generate_request = nil

      result = {
        :outputUrl => data['outputUrl'],
        :previewUrl => data['previewUrl'],
        :originalUrl => data['originalUrl'],
        :renderId => data['renderId'],
        :nodesCharged => data['nodesCharged'],
        :totalBalance => data['totalBalance'],
        :fidelityScore => data['fidelityScore'],
        :fidelityWarning => data['fidelityWarning'] || data['semanticWarning'],
        :seed => data['seed']
      }
      @last_result = result
      @balance = { 'totalBalance' => data['totalBalance'] } if data['totalBalance']
      persist_last_result(result)
      emit('result', result)
    end

    # A conexão caiu com uma geração possivelmente concluída no servidor.
    # Espera e busca no histórico um render criado depois do início desta
    # geração — se existir, o resultado (já pago) é recuperado.
    def reconcile_lost_generation
      return unless @generating

      started_at = @generation_started_at || Time.now
      emit('status', { :stage => 'reconcile', :message => 'Conexão instável — verificando se o render foi concluído…' })

      epoch = @generation_epoch
      previous_id = @last_result && (@last_result[:renderId] || @last_result['renderId'])

      ::UI.start_timer(6, false) do
        on_fail = proc do |_e|
          fail_generation('Não foi possível confirmar a geração. Veja o Histórico antes de gerar de novo — os Nodes podem ter sido usados.') if generation_alive?(epoch)
        end
        json_request(:get, '/api/renders/list', nil, on_fail) do |data|
          next unless generation_alive?(epoch)

          renders = data['renders'].is_a?(Array) ? data['renders'] : []
          # Nunca adotar o render ANTERIOR como se fosse o desta geração:
          # exclui o último renderId conhecido e exige created_at após o
          # início (com 60s de folga pra clock skew cliente↔servidor).
          found = renders.find do |r|
            begin
              next false if previous_id && r['id'].to_s == previous_id.to_s

              Time.parse(r['created_at'].to_s) >= started_at - 60
            rescue StandardError
              false
            end
          end
          if found && found['output_url']
            finish_generation(
              'outputUrl' => found['output_url'],
              'previewUrl' => found['preview_url'],
              'originalUrl' => found['input_url'],
              'renderId' => found['id'],
              'nodesCharged' => found['nodes_charged']
            )
          else
            fail_generation('A conexão caiu durante a geração. Veja o Histórico antes de gerar de novo — os Nodes podem ter sido usados.')
          end
        end
      end
    end

    def handle_cancel
      request = @generate_request
      @generate_request = nil
      @generating = false
      @pending_generate = nil
      # Invalida TODA continuação em voo (sign/PUT/generate) — sem isso, o
      # callback do sign ainda dispararia o POST /api/generate e cobraria
      # Nodes de uma geração cancelada.
      @generation_epoch = (@generation_epoch || 0) + 1
      if request
        begin
          request.cancel
        rescue StandardError
          nil
        end
      end
      emit('status', { :stage => 'idle', :message => 'Geração cancelada.' })
    end

    def fail_generation(message, auth_expired = false)
      @generating = false
      @generate_request = nil
      emit_error(message, auth_expired, true)
    end

    # Última geração viaja com o arquivo .skp (operação transparente — não
    # cria passo próprio na pilha de undo do usuário).
    def persist_last_result(result)
      model = ::Sketchup.active_model
      return unless model

      begin
        model.start_operation('SPACENODE', true, false, true)
        model.set_attribute('spacenode', 'last_result', JSON.generate(result))
        model.commit_operation
      rescue StandardError
        begin
          model.abort_operation
        rescue StandardError
          nil
        end
      end
    end

    # ── Histórico / download ─────────────────────────────────────────────────

    def fetch_history(raw)
      payload = parse_json(raw)
      cursor = payload['cursor'].to_s
      path = cursor.empty? ? '/api/renders/list' : "/api/renders/list?cursor=#{URI.encode_www_form_component(cursor)}"
      json_request(:get, path, nil, method(:emit_api_error)) do |data|
        emit('history', data)
      end
    end

    def save_result_to_disk(raw)
      payload = parse_json(raw)
      url = payload['url'].to_s
      raise 'Nenhum render pra salvar.' if url.empty?

      suggested = payload['suggestedName'].to_s
      suggested = "spacenode-render-#{Time.now.strftime('%Y%m%d-%H%M')}.png" if suggested.empty?
      target = ::UI.savepanel('Salvar render', nil, suggested)
      return unless target

      emit('status', { :stage => 'download', :message => 'Baixando o render…' })
      http_request(:get, url, :auth => false) do |response|
        status = response.status_code.to_i
        body = response.body.to_s
        if status >= 200 && status < 300 && image_bytes?(body)
          File.binwrite(target, body)
          emit('saved', { :path => target })
        else
          # Corpo não é imagem (página de erro, corpo corrompido) — não
          # gravar lixo; o site sempre funciona como fallback.
          emit_error('Não foi possível baixar o render. Tente pelo site.')
          open_url(url) if status >= 200 && status < 300
        end
      end
    end

    # Assinaturas PNG/JPEG/WebP — o suficiente pra distinguir imagem de uma
    # página de erro/HTML antes de gravar em disco.
    def image_bytes?(body)
      return false if body.nil? || body.bytesize < 12

      bytes = body.byteslice(0, 12).bytes
      return true if bytes[0, 4] == [0x89, 0x50, 0x4E, 0x47]
      return true if bytes[0, 2] == [0xFF, 0xD8]
      return true if bytes[0, 4] == [0x52, 0x49, 0x46, 0x46] && bytes[8, 4] == [0x57, 0x45, 0x42, 0x50]

      false
    end

    # ── Configurações ────────────────────────────────────────────────────────

    def handle_save_settings(raw)
      payload = parse_json(raw)
      next_url = normalize_api_base_url(payload['apiBaseUrl'].to_s)
      current_url = api_base_url

      ::Sketchup.write_default(PREFERENCES_KEY, 'api_base_url', next_url)
      if next_url != current_url
        clear_session
        @catalog = nil
        @balance = nil
        ::Sketchup.write_default(PREFERENCES_KEY, 'catalog_json', '')
      end
      send_state
    end

    def api_base_url
      normalize_api_base_url(
        ::Sketchup.read_default(PREFERENCES_KEY, 'api_base_url', DEFAULT_API_BASE_URL).to_s
      )
    rescue StandardError
      DEFAULT_API_BASE_URL
    end

    # https obrigatório (o Bearer viaja em toda request) — http só em
    # localhost pra desenvolvimento.
    def normalize_api_base_url(value)
      raw = value.to_s.strip
      raw = DEFAULT_API_BASE_URL if raw.empty?
      uri = URI.parse(raw)
      raise 'A URL da API deve começar com http:// ou https://.' unless %w[http https].include?(uri.scheme)
      raise 'URL da API inválida.' if uri.host.to_s.empty?

      local = ['localhost', '127.0.0.1'].include?(uri.host)
      raise 'Só HTTPS é aceito (HTTP apenas em localhost).' if uri.scheme == 'http' && !local

      port = uri.port
      default_port = (uri.scheme == 'https' && port == 443) || (uri.scheme == 'http' && port == 80)
      "#{uri.scheme}://#{uri.host}#{default_port ? '' : ":#{port}"}"
    end

    # ── Estado / ponte com o painel ─────────────────────────────────────────

    def send_state
      panel_state = nil
      begin
        raw = read_json_default('panel_state')
        panel_state = JSON.parse(raw) if raw && !raw.empty?
      rescue StandardError
        panel_state = nil
      end

      model_result = nil
      begin
        model = ::Sketchup.active_model
        stored = model && model.get_attribute('spacenode', 'last_result', nil)
        model_result = JSON.parse(stored) if stored.is_a?(String) && !stored.empty?
      rescue StandardError
        model_result = nil
      end

      emit('state', {
        :apiBaseUrl => api_base_url,
        :authenticated => authenticated?,
        :sessionFresh => session_fresh?,
        :userEmail => ::Sketchup.read_default(PREFERENCES_KEY, 'user_email', '').to_s,
        :version => VERSION,
        :balance => @balance,
        :panelState => panel_state,
        :lastResult => @last_result || model_result
      })
    end

    def parse_json(raw)
      JSON.parse(raw.to_s)
    rescue JSON::ParserError
      {}
    end

    def emit(event, payload = {})
      dialog = @dialog
      return unless dialog

      script = "window.SpaceNodeBridge && window.SpaceNodeBridge.receive(#{JSON.generate(event)}, #{JSON.generate(payload)});"
      begin
        dialog.execute_script(script)
      rescue StandardError
        nil
      end
    end

    # generation=true marca erros que encerram uma geração — só esses podem
    # destravar a UI de "gerando" no painel (erros paralelos, como uma falha
    # do histórico, não podem soltar o overlay de uma geração em andamento).
    def emit_error(message, auth_expired = false, generation = false)
      emit('error', {
        :message => message.to_s,
        :authExpired => auth_expired ? true : false,
        :generation => generation ? true : false
      })
    end

    def open_url(url)
      raw = url.to_s.strip
      uri = URI.parse(raw)
      return unless %w[http https].include?(uri.scheme)

      ::UI.openURL(raw)
    rescue StandardError
      emit_error('URL inválida.')
    end

    # ── Registro de UI ───────────────────────────────────────────────────────

    unless file_loaded?(__FILE__)
      command = ::UI::Command.new('SPACENODE') { SpaceNode::SketchUp.activate }
      command.tooltip = 'SPACENODE'
      command.status_bar_text = 'Renderizar a vista atual com a SPACENODE'

      icon_base = File.join(__dir__, 'assets')
      if ::Sketchup.platform == :platform_win && File.exist?(File.join(icon_base, 'spacenode.svg'))
        command.small_icon = File.join(icon_base, 'spacenode.svg')
        command.large_icon = File.join(icon_base, 'spacenode.svg')
      elsif File.exist?(File.join(icon_base, 'spacenode-24.png'))
        command.small_icon = File.join(icon_base, 'spacenode-24.png')
        command.large_icon = File.join(icon_base, 'spacenode-48.png')
      end

      ::UI.menu('Extensions').add_item(command)

      toolbar = ::UI::Toolbar.new('SPACENODE')
      toolbar.add_item(command)
      toolbar.restore

      file_loaded(__FILE__)
    end
  end
end
