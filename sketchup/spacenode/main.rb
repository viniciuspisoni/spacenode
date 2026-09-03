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
require 'fileutils'
require 'uri'

module SpaceNode
  module SketchUp
    extend self

    VERSION = '0.7.0'
    PREFERENCES_KEY = 'com.spacenode.sketchup'
    DEFAULT_API_BASE_URL = 'https://spacenode.app'
    MIN_SKETCHUP_MAJOR = 21          # Ruby 2.7+; recomendado 2024+
    CATALOG_TTL_SECONDS = 6 * 3600
    GENERATE_TIMEOUT_SECONDS = 320   # /api/generate tem maxDuration=300
    UPLOAD_TIMEOUT_SECONDS = 120     # sign/PUT/confirm (Sketchup::Http não tem timeout)
    DOWNLOAD_TIMEOUT_SECONDS = 180   # download_to_file (render/vídeo) — não tinha watchdog
    VIDEO_STAGE_TIMEOUT_SECONDS = 60 # GET do preview antes de animar (mesmo valor do quote do Ampliar)
    CATALOG_MIN_VERSION = 6          # cache em disco mais velho que isso é descartado (bloco animar)

    # Strings do Ruby visíveis no painel (etapas/erros centrais). O grosso da
    # UI é traduzido no dialog; mensagens vindas do SERVIDOR seguem em pt-BR.
    RB_STRINGS = {
      'pt' => {
        :capturing => 'Capturando a vista…',
        :sending => 'Enviando o projeto…',
        :sending_materials => 'Enviando materiais do modelo…',
        :generating => 'Gerando na SPACENODE…',
        :editing => 'Editando na SPACENODE…',
        :upscaling => 'Ampliando na SPACENODE…',
        :renewing => 'Renovando sessão…',
        :cancelled => 'Geração cancelada.',
        :view_restored => 'Vista do render restaurada.',
        :downloading => 'Baixando o render…',
        :reconciling => 'Conexão instável — verificando se o render foi concluído…',
        :connect_first => 'Conecte sua conta SPACENODE primeiro.',
        :busy => 'Já existe uma geração em andamento.',
        :session_expired => 'Sua sessão expirou. Conecte novamente.',
        :pairing_waiting => 'Confirme o código no navegador…',
        :pairing_expired => 'O código expirou. Clique em Conectar pra gerar outro.',
        :pairing_failed => 'Não foi possível conectar. Tente de novo.',
        :save_title => 'Salvar render',
        :animar_prep => 'Preparando o vídeo…',
        :animar_sending => 'Enviando o render…',
        :animating => 'Animando na SPACENODE…',
        :animar_eta => 'costuma levar ~%d min',
        :animar_reconciling => 'Conexão instável — verificando se o vídeo foi concluído…',
        :downloading_video => 'Baixando o vídeo…',
        :save_video_title => 'Salvar vídeo',
        :video_cancel_warn => 'Cancelado no painel — o vídeo pode já ter sido gerado e cobrado. Veja o Histórico no site.',
        :notif_video_ready => 'Vídeo pronto',
        :notif_video_failed => 'A animação falhou',
        :notif_open_panel => 'Abrir painel'
      },
      'en' => {
        :capturing => 'Capturing the view…',
        :sending => 'Uploading the project…',
        :sending_materials => 'Uploading model materials…',
        :generating => 'Rendering on SPACENODE…',
        :editing => 'Editing on SPACENODE…',
        :upscaling => 'Upscaling on SPACENODE…',
        :renewing => 'Renewing session…',
        :cancelled => 'Generation cancelled.',
        :view_restored => 'Render view restored.',
        :downloading => 'Downloading the render…',
        :reconciling => 'Unstable connection — checking if the render finished…',
        :connect_first => 'Connect your SPACENODE account first.',
        :busy => 'A generation is already running.',
        :session_expired => 'Your session expired. Connect again.',
        :pairing_waiting => 'Confirm the code in your browser…',
        :pairing_expired => 'The code expired. Click Connect to get a new one.',
        :pairing_failed => 'Could not connect. Try again.',
        :save_title => 'Save render',
        :animar_prep => 'Preparing the video…',
        :animar_sending => 'Uploading the render…',
        :animating => 'Animating on SPACENODE…',
        :animar_eta => 'usually takes ~%d min',
        :animar_reconciling => 'Unstable connection — checking if the video finished…',
        :downloading_video => 'Downloading the video…',
        :save_video_title => 'Save video',
        :video_cancel_warn => 'Cancelled in the panel — the video may already have been generated and charged. Check History on the site.',
        :notif_video_ready => 'Video ready',
        :notif_video_failed => 'The animation failed',
        :notif_open_panel => 'Open panel'
      }
    }.freeze

    # Lado maior da captura por resolução de saída. O servidor normaliza em
    # 4096 px — capturar menos que isso pra 2K/4K joga fora o sinal
    # geométrico que o motor de fidelidade precisa.
    CAPTURE_EDGE = { 'hd' => 2048, '2k' => 3072, '4k' => 4096 }.freeze

    # Higiene de captura: opções que poluem a imagem que a IA vê (sketchy
    # edges, extensão de linha, névoa, guias, grade de seção). Salvas e
    # RESTAURADAS MANUALMENTE — RenderingOptions não entram em operações.
    # 'EdgeType' 0 = arestas padrão (1 = sketchy/NPR) — a chave
    # 'DisplaySketchEdges' NÃO existe em RenderingOptions. Sombras vivem em
    # ShadowInfo, não aqui.
    CLEAN_CAPTURE_OPTIONS = {
      'DisplaySectionPlanes' => false,
      'EdgeType' => 0,
      'JitterEdges' => false,
      'ExtendLines' => false,
      'DrawDepthQue' => false,
      'DrawLineEnds' => false,
      'DisplayFog' => false,
      'HideConstructionGeometry' => true,
      # v2 (0.6.0): a IA preserva EXATAMENTE o que vê — e com a fidelidade
      # sempre máxima, um estilo X-ray, cor por tag, cotas, textos, eixos ou
      # marca d'água na tela viram "parte do projeto" no render. Tudo isso
      # fica de fora só durante a captura; chave inexistente na versão é
      # pulada por apply_rendering_options (leitura nil).
      'Texture' => true,
      'ModelTransparency' => false,
      'DisplayColorByLayer' => false,
      'DisplayWatermarks' => false,
      'DisplaySketchAxes' => false,
      'DisplayInstanceAxes' => false,
      'DisplayText' => false,
      'DisplayDims' => false,
      # Corte preenchido quando o usuário JÁ exibe cortes (não forçamos
      # DisplaySectionCuts: ligar um corte que ele escondeu mudaria a cena).
      'SectionCutFilled' => true
    }.freeze

    # RenderMode do SketchUp: 0 wireframe, 1 hidden line, 2 shaded,
    # 3 shaded with textures, 5 monochrome. A captura fotográfica é a 3 —
    # wireframe/hidden line/monochrome viram "render de linhas" se forem
    # pra IA. Aplicado só quando o modo atual for outro inteiro conhecido.
    PHOTO_RENDER_MODE = 3

    # Edge map nativo: hidden-line (RenderMode 1) da MESMA câmera — mapa de
    # arestas geometricamente exato pro condicionamento estrutural do backend.
    # Sombras são desligadas via ShadowInfo no bloco da captura do edge.
    EDGE_CAPTURE_OPTIONS = {
      'RenderMode' => 1,
      'EdgeType' => 0,
      'JitterEdges' => false,
      'ExtendLines' => false,
      'DrawLineEnds' => false,
      'DisplayFog' => false
    }.freeze

    # Presets de sol (hora local aplicada só durante a captura, com restauro).
    SUN_PRESETS = %w[atual manha meiodia tarde golden].freeze

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

    # 'auto' segue o idioma do SketchUp (Sketchup.get_locale, ex.: 'pt-BR',
    # 'en-US', 'fr' — parsing tolerante); override manual 'pt'/'en' nas
    # configurações do painel.
    def locale
      override = ::Sketchup.read_default(PREFERENCES_KEY, 'locale', 'auto').to_s
      return override if %w[pt en].include?(override)

      raw = begin
        ::Sketchup.get_locale.to_s
      rescue StandardError
        'en'
      end
      raw.downcase.start_with?('pt') ? 'pt' : 'en'
    end

    def t(key)
      table = RB_STRINGS[locale] || RB_STRINGS['pt']
      table[key] || RB_STRINGS['pt'][key] || key.to_s
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
      dialog.add_action_callback('generateBatch') do |_ctx, raw|
        begin
          handle_generate_batch(raw)
        rescue StandardError => e
          # generation:true: o painel armou a UI de lote no clique e um erro
          # aqui encerra a tentativa — precisa desarmar.
          emit_error(e.message, false, true)
        end
      end
      dialog.add_action_callback('listScenes') do |_ctx|
        begin
          list_scenes
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('listMaterials') do |_ctx|
        begin
          list_materials
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('restoreCamera') do |_ctx, raw|
        begin
          restore_camera(raw)
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('upscaleQuote') do |_ctx, raw|
        begin
          handle_upscale_quote(raw)
        rescue StandardError => e
          emit_error(e.message, false, true)
        end
      end
      dialog.add_action_callback('confirmUpscale') do |_ctx|
        begin
          run_upscale
        rescue StandardError => e
          emit_error(e.message, false, true)
        end
      end
      dialog.add_action_callback('cancelUpscale') do |_ctx|
        pending = @upscale_pending
        @upscale_pending = nil
        delete_quiet(pending[:path]) if pending
        emit('status', { :stage => 'idle', :message => '' })
      end
      dialog.add_action_callback('editQuote') do |_ctx, raw|
        begin
          handle_edit_quote(raw)
        rescue StandardError
          nil
        end
      end
      dialog.add_action_callback('applyEdit') do |_ctx, raw|
        begin
          handle_apply_edit(raw)
        rescue StandardError => e
          emit_error(e.message, false, true)
        end
      end
      dialog.add_action_callback('createSpace') do |_ctx, raw|
        begin
          handle_create_space(raw)
        rescue StandardError => e
          emit_error(e.message, false, true)
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
          start_pairing
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('cancelPairing') do |_ctx|
        stop_pairing
        emit('pairingDone', { :ok => false })
        emit('status', { :stage => 'idle', :message => '' })
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
      dialog.add_action_callback('refreshResult') do |_ctx, raw|
        begin
          refresh_result(raw)
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('animar') do |_ctx, raw|
        begin
          handle_animar(raw)
        rescue StandardError => e
          emit_error(e.message, false, true)
        end
      end
      dialog.add_action_callback('saveVideo') do |_ctx, raw|
        begin
          save_video_to_disk(raw)
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('openVideo') do |_ctx, _raw|
        begin
          open_last_video
        rescue StandardError => e
          emit_error(e.message)
        end
      end
      dialog.add_action_callback('revealVideo') do |_ctx, _raw|
        reveal_last_video
      end
      dialog.add_action_callback('openUrl') do |_ctx, url|
        open_url(url)
      end
    end

    def on_panel_ready
      send_state
      ensure_catalog
      list_scenes
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

    def json_request(method, path, body, on_error, opts = {}, &on_success)
      options = {}
      options[:auth] = false if opts[:auth] == false
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
          # message primeiro: rotas novas usam error como código de máquina
          # ('insufficient_balance') e o texto humano vem em message.
          data['message'] || data['error']
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

    # ── Sessão (pareamento por código — device flow) ─────────────────────────
    #
    # O plugin guarda APENAS device_id + device_secret (opaco, revogável no
    # servidor) + o access token corrente. Refresh token NUNCA chega aqui —
    # a renovação é POST /api/sketchup/pair/refresh, com o token custodiado
    # e rotacionado no servidor. O login acontece no NAVEGADOR DO SISTEMA
    # (UI.openURL) — onde a sessão Google do usuário vive.

    PAIR_POLL_MAX_SECONDS = 660

    def start_pairing
      stop_pairing

      device_name = begin
        "SketchUp #{::Sketchup.version.to_s.split('.').first} · #{ENV['COMPUTERNAME'] || ENV['HOSTNAME'] || 'desktop'}"
      rescue StandardError
        'SketchUp'
      end

      json_request(:post, '/api/sketchup/pair/start', { :deviceName => device_name },
                   proc { |e| emit_error(e.message) }, :auth => false) do |data|
        device_id = data['deviceId'].to_s
        secret = data['deviceSecret'].to_s
        code = data['userCode'].to_s
        url = data['verificationUrl'].to_s
        if device_id.empty? || secret.empty? || code.empty?
          emit_error(t(:pairing_failed))
        else
          @pairing = {
            :device_id => device_id,
            :secret => secret,
            :deadline => Time.now + [data['expiresIn'].to_i, PAIR_POLL_MAX_SECONDS].min
          }
          emit('pairing', { :code => code, :url => url, :expiresIn => data['expiresIn'].to_i })
          emit('status', { :stage => 'auth', :message => t(:pairing_waiting) })
          open_url(url)
          schedule_pair_poll([data['pollInterval'].to_i, 2].max)
        end
      end
    end

    def schedule_pair_poll(interval)
      pairing = @pairing
      return unless pairing

      ::UI.start_timer(interval, false) do
        begin
          poll_pairing(pairing, interval)
        rescue StandardError
          nil
        end
      end
    end

    def poll_pairing(pairing, interval)
      return unless @pairing.equal?(pairing)

      if Time.now > pairing[:deadline]
        stop_pairing
        emit('pairingDone', { :ok => false })
        emit_error(t(:pairing_expired))
        return
      end

      body = { :deviceId => pairing[:device_id], :deviceSecret => pairing[:secret] }
      on_error = proc do |error|
        next unless @pairing.equal?(pairing)

        status = error.respond_to?(:status) ? error.status.to_i : 0
        if status == 410
          stop_pairing
          emit('pairingDone', { :ok => false })
          emit_error(t(:pairing_expired))
        elsif status >= 400 && status != 429
          stop_pairing
          emit('pairingDone', { :ok => false })
          emit_error(error.message)
        else
          # rede/429: continua tentando até o deadline
          schedule_pair_poll(interval)
        end
      end
      json_request(:post, '/api/sketchup/pair/claim', body, on_error, :auth => false) do |data|
        next unless @pairing.equal?(pairing)

        if data['status'] == 'ready' && !data['accessToken'].to_s.empty?
          ::Sketchup.write_default(PREFERENCES_KEY, 'device_id', pairing[:device_id])
          ::Sketchup.write_default(PREFERENCES_KEY, 'device_secret', pairing[:secret])
          save_access_token(data['accessToken'].to_s, data['expiresAt'].to_i, data['userEmail'])
          stop_pairing
          emit('pairingDone', { :ok => true })
          send_state
          ensure_catalog
          check_session
        else
          schedule_pair_poll(interval)
        end
      end
    end

    def stop_pairing
      @pairing = nil
    end

    def save_access_token(token, expires_at, email = nil)
      ::Sketchup.write_default(PREFERENCES_KEY, 'access_token', token)
      ::Sketchup.write_default(PREFERENCES_KEY, 'expires_at', expires_at.to_i)
      ::Sketchup.write_default(PREFERENCES_KEY, 'user_email', email.to_s) unless email.nil?
    end

    def clear_session
      stop_pairing
      ::Sketchup.write_default(PREFERENCES_KEY, 'access_token', '')
      ::Sketchup.write_default(PREFERENCES_KEY, 'expires_at', 0)
      ::Sketchup.write_default(PREFERENCES_KEY, 'user_email', '')
      ::Sketchup.write_default(PREFERENCES_KEY, 'device_id', '')
      ::Sketchup.write_default(PREFERENCES_KEY, 'device_secret', '')
      @account_theme = nil
    end

    # 401 do servidor: com dispositivo pareado, só o access token cai (a
    # próxima ação renova via pair/refresh); sem dispositivo, desconecta.
    def handle_auth_failure
      if device_paired?
        ::Sketchup.write_default(PREFERENCES_KEY, 'expires_at', 0)
      else
        clear_session
      end
      send_state
    end

    def device_paired?
      !::Sketchup.read_default(PREFERENCES_KEY, 'device_id', '').to_s.empty? &&
        !::Sketchup.read_default(PREFERENCES_KEY, 'device_secret', '').to_s.empty?
    end

    def authenticated?
      device_paired? || !access_token.empty?
    end

    # Token utilizável sem renovar? expiresAt desconhecido conta como VENCIDO
    # (o contrário — "válido pra sempre" — era o bug B4 do MVP).
    def session_fresh?
      return false if access_token.empty?

      expires_at = ::Sketchup.read_default(PREFERENCES_KEY, 'expires_at', 0).to_i
      # Folga de 10 min (não 60 s): um lote de cenas em 4K ou o wizard do
      # Space levam mais que isso entre etapas — renovar cedo custa zero
      # (coalescido) e evita um 401 no meio de um lote pago.
      expires_at > Time.now.to_i + 600
    end

    def access_token
      ::Sketchup.read_default(PREFERENCES_KEY, 'access_token', '').to_s
    end

    # Garante token fresco e SEGUE (continuation): renova via pair/refresh
    # quando pareado. generation_scope marca se um fracasso deve desarmar a
    # UI de geração do painel.
    def ensure_fresh_session(generation_scope, &continuation)
      if session_fresh?
        continuation.call
        return
      end

      unless device_paired?
        session_step_failed(t(:session_expired), true, generation_scope)
        return
      end

      # Coalescing: a renovação é assíncrona (segundos). Um 2º clique nesse
      # intervalo NÃO pode disparar um 2º POST /pair/refresh — dois refreshes
      # concorrentes rotacionam o mesmo token e um 401 de corrida chamaria
      # clear_session, deslogando por baixo da geração. Enfileira a
      # continuação; um único refresh serve todas.
      @refresh_waiters ||= []
      @refresh_waiters << [continuation, generation_scope]
      return if @renewing

      @renewing = true
      emit('status', { :stage => 'auth', :message => t(:renewing) })
      body = {
        :deviceId => ::Sketchup.read_default(PREFERENCES_KEY, 'device_id', '').to_s,
        :deviceSecret => ::Sketchup.read_default(PREFERENCES_KEY, 'device_secret', '').to_s
      }
      finish = proc do |ok, message|
        @renewing = false
        waiters = @refresh_waiters || []
        @refresh_waiters = []
        waiters.each do |cont, scope|
          if ok
            # A continuação roda DENTRO do callback HTTP: uma exceção aqui
            # cairia no rescue genérico do http_request, que não encerra a
            # geração — overlay "Renovando sessão…" preso pra sempre.
            begin
              cont.call
            rescue StandardError => e
              session_step_failed(e.message, false, scope)
            end
          else
            session_step_failed(message[:text], message[:auth], scope)
          end
        end
      end
      on_error = proc do |error|
        status = error.respond_to?(:status) ? error.status.to_i : 0
        if status == 401
          clear_session
          send_state
          finish.call(false, { :text => t(:session_expired), :auth => true })
        else
          finish.call(false, { :text => error.message, :auth => false })
        end
      end
      json_request(:post, '/api/sketchup/pair/refresh', body, on_error, :auth => false) do |data|
        token = data['accessToken'].to_s
        if token.empty?
          finish.call(false, { :text => t(:session_expired), :auth => true })
        else
          save_access_token(token, data['expiresAt'].to_i)
          finish.call(true, nil)
        end
      end
    end

    # Falha de renovação/continuação: dentro de um lote ou do wizard do
    # Space (scope :batch/:space) o contexto precisa ser ENCERRADO por
    # fail_generation (restaura a cena, fecha o lote, solta @generating);
    # fora deles basta o erro visível.
    def session_step_failed(text, auth, scope)
      if scope == :batch && @generating
        # Sem sessão não há como continuar NENHUMA cena: encerra o lote de
        # uma vez (fail_generation por cena tentaria renovar N vezes e
        # produziria N erros iguais).
        finalize_batch(text, auth)
      elsif scope == :space && @generating
        fail_generation(text, auth)
      else
        emit_error(text, auth, scope ? true : false)
      end
    end

    def check_session
      return unless authenticated?

      json_request(:get, '/api/sketchup/session', nil, method(:emit_api_error)) do |data|
        @balance = data['balance']
        @account_theme = %w[light dark system].include?(data['theme']) ? data['theme'] : nil
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

      parsed = JSON.parse(raw)
      # Cache de antes do bloco 'animar' esconderia a seção por até 6 h
      # depois de atualizar o plugin — descarta e força refresh.
      return nil if parsed.is_a?(Hash) && parsed['version'].to_i < CATALOG_MIN_VERSION

      @catalog = parsed
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
      capture = capture_viewport('2k')
      @last_capture_path = capture[:path]
      emit('capture', capture_event_payload(capture[:path]))
    end

    # ── Sol / câmera / fatos do modelo ──────────────────────────────────────

    # Override temporário do sol (só durante a captura). Devolve o estado
    # salvo pra restauro manual — ShadowInfo tem o mesmo caveat de undo das
    # RenderingOptions.
    def apply_sun_override(model, preset)
      key = preset.to_s
      return nil if key.empty? || key == 'atual' || !SUN_PRESETS.include?(key)

      shadow = model.shadow_info
      saved = {}
      begin
        saved['ShadowTime'] = shadow['ShadowTime']
        saved['DisplayShadows'] = shadow['DisplayShadows']
        target = sun_time_for(shadow, key)
        return nil unless target

        shadow['ShadowTime'] = target
        shadow['DisplayShadows'] = true
        saved
      rescue StandardError
        nil
      end
    end

    def restore_sun_override(model, saved)
      return unless saved

      shadow = model.shadow_info
      saved.each do |key, value|
        begin
          shadow[key] = value unless value.nil?
        rescue StandardError
          nil
        end
      end
    rescue StandardError
      nil
    end

    # ShadowTime do SketchUp guarda o relógio de parede nos componentes UTC
    # do Time — lemos e escrevemos SEMPRE por .utc pra ficar consistente.
    def sun_time_for(shadow, preset)
      base = shadow['ShadowTime'] || Time.now
      wall = base.utc
      case preset
      when 'manha'   then Time.utc(wall.year, wall.month, wall.day, 9, 0)
      when 'meiodia' then Time.utc(wall.year, wall.month, wall.day, 12, 30)
      when 'tarde'   then Time.utc(wall.year, wall.month, wall.day, 15, 30)
      when 'golden'
        sunset = shadow['SunSet']
        if sunset
          s = sunset.utc
          Time.utc(wall.year, wall.month, wall.day, s.hour, s.min) - (45 * 60)
        else
          Time.utc(wall.year, wall.month, wall.day, 17, 45)
        end
      end
    rescue StandardError
      nil
    end

    # Posição solar aproximada (declinação + ângulo horário — NOAA
    # simplificado; erro < ~2°, suficiente pra direção descritiva no prompt).
    def solar_position(lat_deg, lon_deg, wall_time, tz_offset)
      d2r = Math::PI / 180.0
      day = wall_time.yday
      declination = -23.44 * Math.cos(d2r * (360.0 / 365.0) * (day + 10))
      solar_hour = wall_time.hour + (wall_time.min / 60.0) + (lon_deg / 15.0 - tz_offset.to_f)
      hour_angle = (solar_hour - 12.0) * 15.0

      lat = lat_deg * d2r
      dec = declination * d2r
      hra = hour_angle * d2r
      sin_elevation = (Math.sin(lat) * Math.sin(dec)) + (Math.cos(lat) * Math.cos(dec) * Math.cos(hra))
      sin_elevation = 1.0 if sin_elevation > 1.0
      sin_elevation = -1.0 if sin_elevation < -1.0
      elevation = Math.asin(sin_elevation) / d2r
      azimuth = Math.atan2(Math.sin(hra), (Math.cos(hra) * Math.sin(lat)) - (Math.tan(dec) * Math.cos(lat))) / d2r
      [(azimuth + 180.0) % 360.0, elevation]
    end

    # Ativa uma cena PRA CAPTURA de forma fiel. O selected_page= aplica
    # tags/estilo/sombras, MAS a troca de câmera dele é ADIADA (anima "como se
    # o usuário clicasse na aba") e não assenta antes do write_image seguinte
    # — por isso todas as cenas saíam com a vista que estava na tela. A cura é
    # setar view.camera direto: manipulação de câmera é SÍNCRONA e o
    # write_image (source :image) renderiza a partir dela na hora.
    def apply_page_for_capture(model, page)
      pages = model.pages
      begin
        old_transition = page.transition_time
        begin
          page.transition_time = 0
          pages.selected_page = page
        ensure
          page.transition_time = old_transition if old_transition
        end
      rescue StandardError
        nil
      end
      begin
        uses_camera = page.respond_to?(:use_camera?) ? page.use_camera? : true
        model.active_view.camera = page.camera if uses_camera
      rescue StandardError
        nil
      end
    end

    def snapshot_camera(view)
      camera = view.camera
      data = {
        :eye => camera.eye.to_a,
        :target => camera.target.to_a,
        :up => camera.up.to_a,
        :perspective => camera.perspective? ? true : false
      }
      if camera.perspective?
        data[:fov] = camera.fov
      else
        # Em projeção paralela o "zoom" é a altura de vista (polegadas).
        data[:height] = camera.height
      end
      data
    rescue StandardError
      nil
    end

    def restore_camera(raw)
      payload = parse_json(raw)
      data = payload['camera'].is_a?(Hash) ? payload['camera'] : payload
      eye = vector3(data['eye'])
      target = vector3(data['target'])
      up = vector3(data['up'])
      unless eye && target && up
        emit_error('Esta geração não guardou a câmera.')
        return
      end

      camera = ::Sketchup::Camera.new(
        ::Geom::Point3d.new(*eye),
        ::Geom::Point3d.new(*target),
        ::Geom::Vector3d.new(*up)
      )
      fov = data['fov']
      if data['perspective'] == false
        camera.perspective = false
        height = data['height']
        camera.height = height if height.is_a?(Numeric) && height > 0
      elsif fov.is_a?(Numeric) && fov > 0
        camera.fov = fov
      end

      model = ::Sketchup.active_model
      raise 'Nenhum modelo aberto no SketchUp.' unless model

      model.active_view.camera = camera
      emit('status', { :stage => 'idle', :message => t(:view_restored) })
    end

    def vector3(value)
      return nil unless value.is_a?(Array) && value.length == 3
      return nil unless value.all? { |v| v.is_a?(Numeric) }

      value.map(&:to_f)
    end

    # Fatos medidos do modelo pro prompt (câmera + sol) — best-effort: nil
    # em qualquer falha; o servidor sanitiza de novo. Lê o estado VIGENTE
    # (chamado dentro da captura, com override de sol ainda aplicado).
    def collect_model_facts
      model = ::Sketchup.active_model
      return nil unless model

      facts = {}
      begin
        camera = model.active_view.camera
        if camera.perspective?
          cam = { :fovDeg => camera.fov.round(1) }
          begin
            cam[:focalLengthMm] = camera.focal_length.round
          rescue StandardError
            nil
          end
          up = camera.up
          cam[:twoPoint] = true if up && up.z.abs > 0.999 && camera.direction.z.abs < 0.98
          facts[:camera] = cam
        end
      rescue StandardError
        nil
      end

      begin
        shadow = model.shadow_info
        st = shadow['ShadowTime']
        if st
          wall = st.utc
          lat = shadow['Latitude'].to_f
          lon = shadow['Longitude'].to_f
          tz = shadow['TZOffset'].to_f
          azimuth, elevation = solar_position(lat, lon, wall, tz)
          sun = {
            :azimuthDeg => azimuth.round(1),
            :elevationDeg => elevation.round(1),
            :localTime => wall.strftime('%H:%M'),
            :date => wall.strftime('%d %b')
          }
          city = shadow['City'].to_s
          sun[:city] = city[0, 40] unless city.empty?
          sun[:shadowsVisible] = true if shadow['DisplayShadows']
          facts[:sun] = sun
        end
      rescue StandardError
        nil
      end

      facts.empty? ? nil : facts
    end

    # ── Cenas / materiais do modelo ─────────────────────────────────────────

    def list_scenes
      model = ::Sketchup.active_model
      scenes = []
      selected = nil
      if model
        begin
          pages = model.pages
          pages.each_with_index do |page, index|
            scenes << { :index => index, :name => page.name.to_s }
            selected = index if pages.selected_page && page.equal?(pages.selected_page)
          end
        rescue StandardError
          nil
        end
      end
      emit('scenes', { :scenes => scenes, :selectedIndex => selected })
    end

    def list_materials
      model = ::Sketchup.active_model
      materials = []
      if model
        begin
          model.materials.each do |material|
            next unless material.texture

            display = material.display_name.to_s
            display = material.name.to_s if display.empty?
            ext, _mime = texture_export_format(material)
            entry = { :name => material.name.to_s, :displayName => display }
            # Textura .tif/.bmp/.psd… não sai como jpg/png — o painel mostra
            # desabilitado em vez de deixar o usuário escolher e não receber.
            entry[:unsupported] = true unless ext
            materials << entry
            break if materials.length >= 40
          end
        rescue StandardError
          nil
        end
      end
      emit('materials', { :materials => materials })
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

    # Aplica overrides de RenderingOptions devolvendo APENAS o que mudou (pra
    # restauração exata). Chave inexistente na versão (nil) é pulada.
    def apply_rendering_options(rendering, overrides)
      saved = {}
      overrides.each do |key, value|
        begin
          current = rendering[key]
          next if current.nil?
          next if current == value

          saved[key] = current
          rendering[key] = value
        rescue StandardError
          nil
        end
      end
      saved
    end

    def restore_rendering_options(rendering, saved)
      return unless saved

      saved.each do |key, value|
        begin
          rendering[key] = value
        rescue StandardError
          nil
        end
      end
    end

    # Captura determinística. opts:
    #   :sun_preset — 'atual'|'manha'|'meiodia'|'tarde'|'golden' (sol aplicado
    #                 só durante a captura, com restauro manual do ShadowInfo)
    #   :edge_map   — true captura também o hidden-line da MESMA câmera
    # Retorna { :path, :edge_path } e preenche @last_capture_size/mime/camera.
    def capture_viewport(resolution, opts = {})
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

      stamp = "#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{SecureRandom.hex(3)}"
      path = File.join(Dir.tmpdir, "spacenode-viewport-#{stamp}.png")
      edge_path = nil

      rendering = model.rendering_options
      sun_preset = opts[:sun_preset].to_s
      sun_requested = !sun_preset.empty? && sun_preset != 'atual'
      sun_saved = apply_sun_override(model, opts[:sun_preset])
      # Higiene salva/restaurada MANUALMENTE — RenderingOptions não são
      # registradas em operações (abort_operation não as reverte; só viraram
      # undoáveis no SketchUp 2026, e apenas no nível de Page).
      clean = CLEAN_CAPTURE_OPTIONS.dup
      begin
        mode = rendering['RenderMode']
        clean['RenderMode'] = PHOTO_RENDER_MODE if mode.is_a?(Integer) && mode != PHOTO_RENDER_MODE && [0, 1, 2, 5].include?(mode)
      rescue StandardError
        nil
      end
      clean_saved = apply_rendering_options(rendering, clean)
      edge_reason = opts[:edge_map] ? 'write_failed' : 'not_requested'

      begin
        options = {
          :filename => path,
          :width => width,
          :height => height,
          :antialias => true
        }
        options[:scale_factor] = scale if scale > 1.0

        ok = view.write_image(options)
        raise 'Não foi possível capturar a vista atual.' unless ok && File.exist?(path)

        # Um viewport 4K em PNG pode passar do teto da área de upload — cai
        # pra JPEG de alta qualidade antes de falhar. O teto é da ÁREA de
        # destino (render-source 15 MB; spaces-sketch 10 MB via :max_bytes).
        max_bytes = opts[:max_bytes] || 14_000_000
        if File.size(path) > max_bytes
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

        # Fatos do modelo coletados AQUI, com o override de sol ainda
        # aplicado — coletar depois do ensure descreveria o sol restaurado,
        # contradizendo as sombras realmente visíveis na captura.
        facts = collect_model_facts

        # Edge map nativo: hidden-line da MESMA câmera, MESMO tamanho (o
        # condicionamento estrutural exige alinhamento pixel a pixel).
        # Falha aqui nunca derruba a captura — segue sem edge map.
        if opts[:edge_map]
          edge_saved = apply_rendering_options(rendering, EDGE_CAPTURE_OPTIONS)
          # Sombras poluiriam o mapa de arestas (hidden line renderiza
          # sombras!) — desligadas via ShadowInfo, que é onde elas vivem.
          edge_shadow_prev = nil
          begin
            shadow = model.shadow_info
            edge_shadow_prev = shadow['DisplayShadows'] ? true : nil
            shadow['DisplayShadows'] = false if edge_shadow_prev
          rescue StandardError
            edge_shadow_prev = nil
          end
          begin
            candidate = File.join(Dir.tmpdir, "spacenode-edge-#{stamp}.png")
            edge_options = {
              :filename => candidate,
              :width => width,
              :height => height,
              :antialias => true
            }
            edge_options[:scale_factor] = scale if scale > 1.0
            view.write_image(edge_options)
            if File.exist?(candidate)
              if File.size(candidate) <= 14_000_000
                edge_path = candidate
                edge_reason = nil
              else
                edge_reason = 'too_large'
                delete_quiet(candidate)
              end
            end
          rescue StandardError
            edge_path = nil
            edge_reason = 'write_failed'
          ensure
            restore_rendering_options(rendering, edge_saved)
            if edge_shadow_prev
              begin
                model.shadow_info['DisplayShadows'] = true
              rescue StandardError
                nil
              end
            end
          end
        end
      ensure
        restore_rendering_options(rendering, clean_saved)
        restore_sun_override(model, sun_saved)
      end

      @last_capture_size = [width, height]
      @last_capture_mime = path.end_with?('.jpg') ? 'image/jpeg' : 'image/png'
      @last_capture_camera = snapshot_camera(view)
      {
        :path => path, :edge_path => edge_path, :facts => facts,
        # Relatório honesto do que a captura conseguiu — vai pro painel no
        # resultado (o usuário paga o máximo e precisa saber se recebeu).
        :edge_reason => edge_reason,
        :sun_requested => sun_requested,
        :sun_applied => sun_requested && !sun_saved.nil?
      }
    end

    def thumbnail_data_url(path)
      preview = @last_preview_path
      source = preview && File.exist?(preview) ? preview : path
      mime = source.end_with?('.jpg') ? 'image/jpeg' : 'image/png'
      "data:#{mime};base64,#{Base64.strict_encode64(File.binread(source))}"
    end

    def cleanup_stale_captures
      # Cobre viewport, edge map e texturas de material — os caminhos de
      # falha/cancelamento deixam órfãos que só esta varredura recolhe.
      pattern = File.join(Dir.tmpdir, 'spacenode-*')
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
        emit_error(t(:connect_first), true, true)
        return
      end
      if @generating
        # Sem tocar no lock da geração em andamento (generation: false).
        emit_error(t(:busy))
        return
      end

      ensure_fresh_session(true) { run_generation(payload) }
    end

    def run_generation(payload)
      if @generating
        emit_error(t(:busy))
        return
      end

      @generating = true
      # Época invalida callbacks de gerações antigas/canceladas: cada
      # continuação assíncrona confere a época antes de seguir.
      @generation_epoch = (@generation_epoch || 0) + 1
      @generation_context = { :mode => :single }
      execute_generation(payload)
    rescue StandardError => e
      fail_generation(e.message)
    end

    # ── Cenas em lote ────────────────────────────────────────────────────────

    def handle_generate_batch(raw)
      payload = parse_json(raw)
      unless authenticated?
        emit_error(t(:connect_first), true, true)
        return
      end
      if @generating
        emit_error(t(:busy))
        return
      end

      # Identidade das cenas viaja como {index, name} — o nome é a âncora
      # caso as cenas tenham mudado no SketchUp desde o clique.
      entries = Array(payload['scenes']).select { |s| s.is_a?(Hash) }
      entries = Array(payload['sceneIndexes']).map { |i| { 'index' => i.to_i } } if entries.empty?
      if entries.empty?
        emit_error('Selecione ao menos uma cena.')
        return
      end

      ensure_fresh_session(true) { run_batch(payload, entries) }
    end

    def run_batch(payload, entries)
      model = ::Sketchup.active_model
      raise 'Nenhum modelo aberto no SketchUp.' unless model

      pages = model.pages
      original = nil
      begin
        pages.each_with_index do |page, index|
          original = index if pages.selected_page && page.equal?(pages.selected_page)
        end
      rescue StandardError
        original = nil
      end

      @generating = true
      @generation_epoch = (@generation_epoch || 0) + 1
      @generation_context = {
        :mode => :batch,
        :queue => entries.dup,
        :total => entries.length,
        :done => 0,
        :results => [],
        :errors => [],
        :payload => payload,
        :shared_seed => nil,
        :original_scene => original
      }
      emit('batchStart', { :total => entries.length })
      process_next_scene
    end

    def process_next_scene
      ctx = @generation_context
      return unless ctx && ctx[:mode] == :batch

      if ctx[:queue].empty?
        finalize_batch
        return
      end

      model = ::Sketchup.active_model
      unless model
        finalize_batch('O modelo foi fechado no meio do lote.')
        return
      end

      entry = ctx[:queue].shift
      index = entry.is_a?(Hash) ? entry['index'].to_i : entry.to_i
      expected_name = entry.is_a?(Hash) ? entry['name'].to_s : ''
      pages = model.pages
      page = nil
      begin
        page = pages[index]
        # O painel selecionou por índice num instante anterior — se as cenas
        # mudaram no SketchUp, o índice pode apontar pra OUTRA página.
        # A identidade é o nome: divergiu, busca por nome; sumiu, pula.
        if page && !expected_name.empty? && page.name.to_s != expected_name
          match = nil
          pages.each { |p| match = p if match.nil? && p.name.to_s == expected_name }
          page = match
        end
      rescue StandardError
        page = nil
      end
      unless page
        label = expected_name.empty? ? "Cena #{index + 1}" : expected_name
        ctx[:errors] << { :scene => label, :message => 'Cena não encontrada no modelo.' }
        emit('batchProgress', {
          :done => ctx[:done], :total => ctx[:total],
          :sceneName => label, :status => 'error',
          :message => 'Cena não encontrada no modelo.'
        })
        process_next_scene
        return
      end

      ctx[:current_scene] = page.name.to_s
      emit('batchProgress', {
        :done => ctx[:done], :total => ctx[:total],
        :sceneName => ctx[:current_scene], :status => 'generating'
      })

      apply_page_for_capture(model, page)

      payload = ctx[:payload].dup
      payload['seed'] = ctx[:shared_seed] if ctx[:shared_seed]
      # Âncora não se aplica a lote: cada cena é geometria própria; a
      # coerência do conjunto vem do seed compartilhado + mesmos presets.
      payload['useAnchor'] = false
      # Sessão conferida a CADA cena — o token dura ~1 h e um lote 4K passa
      # disso; a renovação é coalescida e só dispara quando faltam <10 min.
      ensure_fresh_session(:batch) { execute_generation(payload, :scene_name => ctx[:current_scene]) }
    rescue StandardError => e
      fail_generation(e.message)
    end

    # Continuação de geração ainda válida? (não cancelada/substituída)
    def generation_alive?(epoch)
      @generating && epoch == @generation_epoch
    end

    # Pipeline de uma geração (single ou uma cena do lote):
    # captura (+sol +edge) → upload da vista → upload do edge → upload dos
    # materiais → POST /api/generate.
    def execute_generation(payload, opts = {})
      epoch = @generation_epoch
      @generation_started_at = Time.now

      emit('status', { :stage => 'capture', :message => t(:capturing) })
      resolution = payload['resolution'].to_s
      # Edge map nativo sempre que não há âncora (em variação o render
      # anterior já é a estrutura). Não depende mais de nível de fidelidade:
      # o seletor foi descontinuado e a fidelidade é sempre máxima.
      want_edge = !payload['useAnchor']

      capture = capture_viewport(
        resolution,
        :sun_preset => payload['sunPreset'],
        :edge_map => want_edge
      )
      @last_capture_path = capture[:path]
      emit('capture', capture_event_payload(capture[:path]))

      facts = capture[:facts]
      camera = @last_capture_camera
      mime = @last_capture_mime || 'image/png'
      conditioning = {
        :edgeRequested => want_edge,
        :edgeMap => false,
        :edgeReason => capture[:edge_reason],
        :sunRequested => capture[:sun_requested] ? true : false,
        :sunApplied => capture[:sun_applied] ? true : false,
        :materialsRequested => 0,
        :materialsSent => 0,
        :skipped => []
      }

      emit('status', { :stage => 'upload', :message => t(:sending) })
      upload_direct(capture[:path], mime, 'render-source', false, epoch) do |source_key, _url|
        delete_quiet(capture[:path])
        upload_edge_map(capture[:edge_path], epoch) do |edge_key|
          conditioning[:edgeMap] = !edge_key.nil?
          conditioning[:edgeReason] = 'upload_failed' if want_edge && capture[:edge_path] && edge_key.nil?
          conditioning[:edgeReason] = nil if edge_key
          upload_materials(payload, epoch) do |material_refs, report|
            if report.is_a?(Hash)
              conditioning[:materialsRequested] = report[:requested].to_i
              conditioning[:materialsSent] = report[:sent].to_i
              conditioning[:skipped] = report[:skipped] || []
            end
            request_generation(source_key, payload,
                               :edge_key => edge_key,
                               :facts => facts,
                               :camera => camera,
                               :material_refs => material_refs,
                               :scene_name => opts[:scene_name],
                               :conditioning => conditioning)
          end
        end
      end
    rescue StandardError => e
      fail_generation(e.message)
    end

    def upload_edge_map(edge_path, epoch, &done)
      if edge_path.nil? || !File.exist?(edge_path)
        done.call(nil)
        return
      end

      upload_direct(edge_path, 'image/png', 'render-source', false, epoch, :optional => true) do |key, _url|
        delete_quiet(edge_path)
        done.call(key)
      end
    end

    # Materiais do modelo selecionados no painel → texturas exportadas e
    # subidas como materialRefs (área render-material, com confirm pra URL).
    # Cada falha individual é pulada — materiais nunca derrubam a geração.
    def upload_materials(payload, epoch, &done)
      selection = payload['materialSel'].is_a?(Array) ? payload['materialSel'].first(4) : []
      report = { :requested => 0, :sent => 0, :skipped => [] }
      if selection.empty?
        done.call([], report)
        return
      end

      model = ::Sketchup.active_model
      jobs = []
      selection.each do |item|
        next unless item.is_a?(Hash)

        name = item['name'].to_s
        field = item['field'].to_s
        next if name.empty? || field.empty?

        report[:requested] += 1
        exported = export_material_texture(model, name)
        if exported[:error]
          report[:skipped] << { :name => name, :reason => exported[:error] }
          next
        end

        jobs << { :path => exported[:path], :field => field, :mime => exported[:mime], :name => name }
      end

      results = []
      step = nil
      step = proc do
        if jobs.empty?
          done.call(results, report)
        else
          job = jobs.shift
          upload_direct(job[:path], job[:mime] || 'image/png', 'render-material', true, epoch, :optional => true) do |_key, url|
            delete_quiet(job[:path])
            if url && !url.empty?
              results << { :field => job[:field], :url => url }
              report[:sent] += 1
            else
              report[:skipped] << { :name => job[:name], :reason => 'upload_failed' }
            end
            step.call
          end
        end
      end
      emit('status', { :stage => 'upload', :message => t(:sending_materials) }) unless jobs.empty?
      step.call
    end

    # Upload direto genérico: sign → PUT (→ confirm quando o consumidor
    # precisa da URL pública). :optional => true não derruba a geração em
    # falha — devolve nil e o chamador segue sem o arquivo.
    #
    # Nesta fase NADA foi cobrado: falha aqui falha na hora (nunca cai na
    # reconciliação, que existe só pro POST /api/generate). O watchdog cobre
    # o caso de request que nunca responde (Sketchup::Http não tem timeout).
    def upload_direct(path, mime, area, want_url, epoch, opts = {}, &done)
      optional = opts[:optional] ? true : false
      settled = { :done => false }
      settle = proc do |key, url|
        unless settled[:done]
          settled[:done] = true
          done.call(key, url)
        end
      end
      on_fail = proc do |error|
        if generation_alive?(epoch) && !settled[:done]
          if optional
            settle.call(nil, nil)
          else
            settled[:done] = true
            status = error.respond_to?(:status) ? error.status : nil
            fail_generation(error.message, status == 401, status)
          end
        end
      end

      ::UI.start_timer(UPLOAD_TIMEOUT_SECONDS, false) do
        if generation_alive?(epoch) && !settled[:done]
          on_fail.call(ApiError.new('O envio travou. Verifique a internet e tente de novo.'))
        end
      end

      size = File.size(path)
      sign_body = { :area => area, :contentType => mime, :sizeBytes => size }
      sign_body[:params] = opts[:params] if opts[:params]
      json_request(:post, '/api/uploads/sign', sign_body, on_fail) do |sign|
        next unless generation_alive?(epoch) && !settled[:done]

        upload_url = sign['uploadUrl'].to_s
        key = sign['key'].to_s
        if upload_url.empty? || key.empty?
          on_fail.call(ApiError.new('Não foi possível preparar o envio da imagem.'))
          next
        end

        binary = File.binread(path)
        http_request(:put, upload_url, :body => binary, :content_type => mime, :auth => false) do |response|
          next unless generation_alive?(epoch) && !settled[:done]

          status = response.status_code.to_i
          unless status >= 200 && status < 300
            on_fail.call(ApiError.new('Falha no envio da imagem. Verifique sua internet e tente de novo.', status))
            next
          end

          if want_url
            confirm_body = { :area => area, :key => key }
            confirm_body[:params] = opts[:params] if opts[:params]
            json_request(:post, '/api/uploads/confirm', confirm_body, on_fail) do |confirm|
              next unless generation_alive?(epoch) && !settled[:done]

              settle.call(key, confirm['url'].to_s)
            end
          else
            settle.call(key, nil)
          end
        end
      end
    end

    def delete_quiet(path)
      File.delete(path) if path && File.exist?(path)
    rescue StandardError
      nil
    end

    # Exporta a textura de um material pra tmp. Texture#write NÃO converte
    # formato pela extensão — preserva os bytes de origem; extensão+mime saem
    # do arquivo original e formatos fora de jpg/png são pulados (as áreas
    # de upload só aceitam jpeg/png/webp). Devolve { :path, :mime } ou nil.
    # Devolve { :path, :mime } ou { :error => motivo } — o motivo vai pro
    # relatório de condicionamento do resultado (nunca silencia).
    def export_material_texture(model, name)
      material = nil
      begin
        material = model && model.materials[name]
      rescue StandardError
        material = nil
      end
      return { :error => 'not_found' } unless material && material.texture

      ext, mime = texture_export_format(material)
      return { :error => 'unsupported_format' } unless ext

      tmp = File.join(Dir.tmpdir, "spacenode-mat-#{SecureRandom.hex(4)}#{ext}")
      written = false
      begin
        # colorize=true respeita o ajuste de cor do material (o que o
        # usuário vê no viewport); fallback pro write simples.
        written = material.texture.write(tmp, true)
      rescue StandardError
        written = false
      end
      unless written
        begin
          written = material.texture.write(tmp)
        rescue StandardError
          written = false
        end
      end
      return { :error => 'export_failed' } unless written && File.exist?(tmp)
      if File.size(tmp) > 7_800_000
        delete_quiet(tmp)
        return { :error => 'too_large' }
      end

      { :path => tmp, :mime => mime }
    end

    # Texture#write não converte formato: só jpg/png saem como estão. Sem
    # extensão (textura embutida) o SketchUp grava PNG.
    def texture_export_format(material)
      source_ext = ''
      begin
        source_ext = File.extname(material.texture.filename.to_s).downcase
      rescue StandardError
        source_ext = ''
      end
      case source_ext
      when '.jpg', '.jpeg' then ['.jpg', 'image/jpeg']
      when '.png', ''      then ['.png', 'image/png']
      else [nil, nil]
      end
    end

    # ── Dimensões de imagem (PNG IHDR / JPEG SOF) ───────────────────────────

    def image_dimensions(bytes)
      return nil if bytes.nil? || bytes.bytesize < 26

      b = bytes.bytes
      if b[0, 4] == [0x89, 0x50, 0x4E, 0x47]
        width = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]
        height = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]
        return [width, height] if width > 0 && height > 0
        return nil
      end
      if b[0, 2] == [0xFF, 0xD8]
        i = 2
        size = bytes.bytesize
        while i + 9 < size
          break unless b[i] == 0xFF

          marker = b[i + 1]
          seg_len = (b[i + 2] << 8) | b[i + 3]
          if [0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].include?(marker)
            height = (b[i + 5] << 8) | b[i + 6]
            width = (b[i + 7] << 8) | b[i + 8]
            return [width, height] if width > 0 && height > 0
            return nil
          end
          i += 2 + seg_len
        end
      end
      nil
    rescue StandardError
      nil
    end

    def request_generation(source_key, payload, extras = {})
      epoch = @generation_epoch
      body = build_generate_payload(source_key, payload)
      body[:edgeMapKey] = extras[:edge_key] if extras[:edge_key]
      body[:modelFacts] = extras[:facts] if extras[:facts]
      if extras[:material_refs].is_a?(Array) && !extras[:material_refs].empty?
        body[:materialRefs] = extras[:material_refs]
      end

      emit('status', { :stage => 'generate', :message => t(:generating) })

      extras = extras.merge(:anchor_dropped => true) if @anchor_dropped
      request = json_request(:post, '/api/generate', body, generation_error_handler_for(epoch)) do |data|
        finish_generation(data, extras) if generation_alive?(epoch)
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
        # Sempre máxima — "Equilibrado"/"Criativo" foram descontinuados
        # (deixavam a IA alucinar no projeto). O servidor também coage.
        :fidelityLevel => 'maximum',
        :engine => payload['engine'].to_s,
        :resolution => payload['resolution'].to_s
      }

      prompt = payload['prompt'].to_s.strip
      body[:refinementText] = prompt unless prompt.empty?

      # Variação: o render anterior vira âncora de materiais/atmosfera e o
      # refino passa a ser cirúrgico (contrato do /api/generate). O painel
      # manda a URL explícita — @last_result é só fallback e não existe após
      # reiniciar o SketchUp (o resultado restaurado do .skp fica só no JS).
      #
      # Desde a 0.6.0 a âncora é PEDIDA (botão "Variação deste render"), não
      # automática — e só vale se a câmera ainda é a do render ancorado: com
      # a vista em outro cômodo, ancorar preservaria materiais/atmosfera de
      # uma cena que não é esta. Divergiu → gera sem âncora e avisa.
      @anchor_dropped = false
      if payload['useAnchor']
        anchor = payload['anchorUrl'].to_s
        anchor = @last_result && @last_result[:outputUrl].to_s if anchor.empty?
        anchor_camera = payload['anchorCamera'].is_a?(Hash) ? payload['anchorCamera'] : (@last_result && @last_result[:camera])
        if anchor && anchor =~ %r{\Ahttps?://}
          # Sem câmera de um dos lados não há como garantir que é a mesma
          # vista — fail-safe é NÃO ancorar (o painel nem oferece a variação
          # pra resultado sem câmera; isto cobre payload antigo/forjado).
          if !anchor_camera || !@last_capture_camera || camera_moved?(anchor_camera, @last_capture_camera)
            @anchor_dropped = true
          else
            body[:anchorUrl] = anchor
          end
        end
      end
      seed = payload['seed']
      body[:seed] = seed.to_i if (seed.is_a?(Numeric) || seed.to_s =~ /\A\d+\z/) && !@anchor_dropped

      body
    end

    # A câmera "mudou" quando olho ou alvo andaram mais de 2% da distância
    # olho→alvo, o FOV mudou mais de meio grau, ou trocou perspectiva ↔
    # paralela. Tolerante a chaves string (JSON do painel) e símbolo (Ruby).
    def camera_moved?(a, b)
      get = proc { |h, k| h[k] || h[k.to_s] || h[k.to_sym] }
      ea = get.call(a, :eye); ta = get.call(a, :target)
      eb = get.call(b, :eye); tb = get.call(b, :target)
      return true unless [ea, ta, eb, tb].all? { |v| v.is_a?(Array) && v.length == 3 }

      dist = proc { |p, q| Math.sqrt((0..2).map { |i| (p[i].to_f - q[i].to_f)**2 }.sum) }
      radius = dist.call(ea, ta)
      radius = 1.0 if radius < 1.0
      moved = dist.call(ea, eb) + dist.call(ta, tb)
      return true if moved > radius * 0.02

      pa = get.call(a, :perspective); pb = get.call(b, :perspective)
      return true if !pa.nil? && !pb.nil? && (pa ? true : false) != (pb ? true : false)

      fa = get.call(a, :fov); fb = get.call(b, :fov)
      return true if fa.is_a?(Numeric) && fb.is_a?(Numeric) && (fa - fb).abs > 0.5

      false
    rescue StandardError
      true
    end

    def generation_error_handler_for(epoch)
      proc do |error|
        if generation_alive?(epoch)
          status = error.respond_to?(:status) ? error.status : nil
          if status.nil? || status.to_i.zero?
            # Queda de rede DEPOIS do POST: o servidor pode ter cobrado e gerado.
            reconcile_lost_generation
          else
            fail_generation(error.message, status == 401, status)
          end
        end
      end
    end

    # Handler pra fluxos SEM reconciliação (upscale/edit/etapas do Space):
    # a reconciliação procura em /api/renders/list — vistas/edits/upscales
    # nunca estão lá, e adotar um render alheio como resultado é pior que
    # falhar. Queda de rede aqui falha na hora com mensagem honesta.
    def direct_error_handler_for(epoch, network_message = nil)
      proc do |error|
        if generation_alive?(epoch)
          status = error.respond_to?(:status) ? error.status : nil
          message = error.message
          if (status.nil? || status.to_i.zero?) && network_message
            message = network_message
          end
          fail_generation(message, status == 401, status)
        end
      end
    end

    def finish_generation(data, extras = {})
      return unless @generating

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
      result[:camera] = extras[:camera] if extras[:camera]
      result[:sceneName] = extras[:scene_name] if extras[:scene_name]
      result[:conditioning] = extras[:conditioning] if extras[:conditioning]
      result[:anchorDropped] = true if extras[:anchor_dropped]
      # URLs assinadas duram 1 h (lib/storage/signed.ts): o painel usa isto
      # pra saber quando re-assinar por renderId em vez de mostrar imagem morta.
      result[:signedAt] = Time.now.to_i

      @last_result = result
      @balance = { 'totalBalance' => data['totalBalance'] } if data['totalBalance']
      @generate_request = nil

      ctx = @generation_context
      if ctx && ctx[:mode] == :batch
        ctx[:shared_seed] ||= result[:seed]
        ctx[:done] += 1
        ctx[:results] << result
        emit('batchProgress', {
          :done => ctx[:done], :total => ctx[:total],
          :sceneName => ctx[:current_scene], :status => 'done',
          :result => result
        })
        process_next_scene
      else
        @generating = false
        @generation_context = nil
        persist_last_result(result)
        emit('result', result)
      end
    end

    # A conexão caiu com uma geração possivelmente concluída no servidor.
    # Espera e busca no histórico um render criado depois do início desta
    # geração — se existir, o resultado (já pago) é recuperado.
    def reconcile_lost_generation
      return unless @generating

      started_at = @generation_started_at || Time.now
      emit('status', { :stage => 'reconcile', :message => t(:reconciling) })

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
              # /api/renders/list não filtra ambient: um take terminado há
              # pouco entraria aqui como se fosse o render (mp4 num <img>).
              next false if r['ambient'].to_s == 'video'
              next false if previous_id && r['id'].to_s == previous_id.to_s

              Time.parse(r['created_at'].to_s) >= started_at - 60
            rescue StandardError
              false
            end
          end
          if found && found['output_url']
            ctx = @generation_context
            finish_generation(
              {
                'outputUrl' => found['output_url'],
                'previewUrl' => found['preview_url'],
                'originalUrl' => found['input_url'],
                'renderId' => found['id'],
                'nodesCharged' => found['nodes_charged']
              },
              :camera => @last_capture_camera,
              :scene_name => ctx && ctx[:mode] == :batch ? ctx[:current_scene] : nil
            )
          else
            fail_generation('A conexão caiu durante a geração. Veja o Histórico antes de gerar de novo — os Nodes podem ter sido usados.')
          end
        end
      end
    end

    def handle_cancel
      request = @generate_request
      ctx = @generation_context
      @generate_request = nil
      @generating = false
      @generation_context = nil
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
      restore_original_scene(ctx)
      if ctx && ctx[:mode] == :batch
        emit('batchDone', {
          :results => ctx[:results], :errors => ctx[:errors],
          :total => ctx[:total], :cancelled => true
        })
      end
      if ctx && ctx[:mode] == :space
        emit('spaceDone', {
          :spaceId => ctx[:space_id], :cancelled => true,
          :spaceUrl => ctx[:space_id] ? "#{api_base_url}/app/spaces/#{ctx[:space_id]}" : nil,
          :name => ctx[:space_name],
          :vistas => [], :errors => ctx[:vista_errors] || []
        })
      end
      late_video = ctx && ctx[:mode] == :animar && ctx[:posted]
      emit('status', { :stage => 'idle', :message => late_video ? t(:video_cancel_warn) : t(:cancelled) })
    end

    # Falha de UMA geração. No lote: saldo/sessão abortam o restante; outros
    # erros registram a cena e seguem pra próxima.
    def fail_generation(message, auth_expired = false, status = nil)
      ctx = @generation_context
      @generate_request = nil

      if ctx && ctx[:mode] == :batch
        if auth_expired || status == 402
          # A cena corrente vira erro visível antes do encerramento — senão
          # a linha dela fica presa como "em andamento" num lote morto.
          ctx[:errors] << { :scene => ctx[:current_scene].to_s, :message => message.to_s }
          emit('batchProgress', {
            :done => ctx[:done], :total => ctx[:total],
            :sceneName => ctx[:current_scene], :status => 'error',
            :message => message.to_s
          })
          finalize_batch(message, auth_expired)
        else
          ctx[:errors] << { :scene => ctx[:current_scene].to_s, :message => message.to_s }
          emit('batchProgress', {
            :done => ctx[:done], :total => ctx[:total],
            :sceneName => ctx[:current_scene], :status => 'error',
            :message => message.to_s
          })
          process_next_scene
        end
      else
        @generating = false
        @generation_context = nil
        restore_original_scene(ctx) if ctx && ctx[:original_scene]
        notify_video(t(:notif_video_failed)) if ctx && ctx[:mode] == :animar
        emit_error(message, auth_expired, true)
      end
    end

    def finalize_batch(abort_message = nil, auth_expired = false)
      ctx = @generation_context
      @generating = false
      @generation_context = nil
      @generate_request = nil
      return unless ctx

      restore_original_scene(ctx)
      persist_last_result(@last_result) if @last_result
      emit('batchDone', {
        :results => ctx[:results],
        :errors => ctx[:errors],
        :total => ctx[:total],
        :aborted => abort_message ? true : false,
        :abortMessage => abort_message
      })
      emit_error(abort_message, auth_expired, true) if abort_message
    end

    def restore_original_scene(ctx)
      return unless ctx && ctx[:original_scene]

      model = ::Sketchup.active_model
      return unless model

      page = model.pages[ctx[:original_scene]]
      if page
        old_transition = page.transition_time
        begin
          page.transition_time = 0
          model.pages.selected_page = page
        ensure
          page.transition_time = old_transition if old_transition
        end
      end
    rescue StandardError
      nil
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

    # URLs assinadas vencem em 1 h. Um resultado restaurado do .skp (ou um
    # painel aberto há mais de uma hora) mostraria imagem morta com
    # Baixar/Ampliar/Editar vivos — GET /api/sketchup/render re-assina pelo
    # renderId e o painel troca as URLs em silêncio (evento resultRefreshed).
    RENDER_ID_RE = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

    def refresh_result(raw)
      payload = parse_json(raw)
      render_id = payload['renderId'].to_s
      return unless render_id =~ RENDER_ID_RE
      return unless authenticated?

      on_fail = proc do |_error|
        emit('resultRefreshFailed', { :renderId => render_id })
      end
      json_request(:get, "/api/sketchup/render?id=#{URI.encode_www_form_component(render_id)}", nil, on_fail) do |data|
        fresh = {
          :renderId => render_id,
          :outputUrl => data['outputUrl'],
          :previewUrl => data['previewUrl'],
          :signedAt => Time.now.to_i
        }
        if fresh[:outputUrl].to_s.empty?
          on_fail.call(nil)
        else
          if @last_result && @last_result[:renderId].to_s == render_id
            @last_result = @last_result.merge(fresh)
            persist_last_result(@last_result)
          else
            merge_persisted_result(render_id, fresh)
          end
          emit('resultRefreshed', fresh)
        end
      end
    end

    # Atualiza as URLs do last_result gravado no .skp quando o Ruby já não
    # tem @last_result (SketchUp reaberto) — sem isso a próxima abertura
    # voltaria a mostrar a URL vencida.
    def merge_persisted_result(render_id, fresh)
      model = ::Sketchup.active_model
      return unless model

      stored = model.get_attribute('spacenode', 'last_result', nil)
      return unless stored.is_a?(String) && !stored.empty?

      current = JSON.parse(stored)
      return unless current.is_a?(Hash) && current['renderId'].to_s == render_id

      fresh.each { |k, v| current[k.to_s] = v }
      persist_last_result(current)
    rescue StandardError
      nil
    end

    # ── Animar: take curto do render (POST /api/video, síncrono até 300 s) ──
    #
    # O painel NUNCA reproduz vídeo (o CEF do SketchUp não decodifica H.264):
    # o resultado é pôster + ações, e o mp4 cai no disco ao lado do .skp.
    # Fonte = preview do render (WebP ≤1600 px — cabe na área animar-source
    # e basta pra 1080p). Custo vem do catálogo; ids são REVALIDADOS aqui.

    def handle_animar(raw)
      payload = parse_json(raw)
      url = payload['url'].to_s
      raise 'Nenhum render pra animar.' if url.empty? || url !~ %r{\Ahttps?://}
      raise t(:connect_first) unless authenticated?
      raise t(:busy) if @generating

      catalog = cached_catalog
      cfg = catalog && catalog['animar']
      raise 'Reconecte pra atualizar o catálogo de custos.' unless cfg.is_a?(Hash)

      spec = animar_spec_from_catalog(cfg, payload)
      ensure_fresh_session(true) { execute_animar(spec) }
    end

    def animar_spec_from_catalog(cfg, payload)
      invalid = 'Opção de vídeo inválida. Feche e reabra o painel pra atualizar o catálogo.'
      engines = cfg['engines'].is_a?(Array) ? cfg['engines'] : []
      engine = engines.find { |e| e.is_a?(Hash) && e['id'].to_s == payload['engine'].to_s }
      raise invalid unless engine

      durations = engine['durations'].is_a?(Array) ? engine['durations'] : []
      dur = durations.find { |d| d.is_a?(Hash) && d['id'].to_s == payload['duration'].to_s }
      raise invalid unless dur

      types = cfg['videoTypes'].is_a?(Array) ? cfg['videoTypes'] : []
      vtype = types.find { |v| v.is_a?(Hash) && v['id'].to_s == payload['videoType'].to_s }
      raise invalid unless vtype

      defaults = vtype['defaults'].is_a?(Hash) ? vtype['defaults'] : {}
      scene_ids = (cfg['scenes'].is_a?(Array) ? cfg['scenes'] : []).map { |s| s.is_a?(Hash) ? s['id'].to_s : nil }.compact
      scene = payload['scene'].to_s
      scene = nil unless scene_ids.include?(scene)
      limits = cfg['limits'].is_a?(Hash) ? cfg['limits'] : {}

      {
        :url => payload['url'].to_s,
        :render_id => payload['renderId'].to_s,
        :scene_name => payload['sceneName'].to_s,
        :video_type => vtype['id'].to_s,
        :engine => engine['id'].to_s,
        :engine_label => engine['label'].to_s,
        :duration => dur['id'].to_s,
        :motion => defaults['motion'].to_s,
        :intensity => defaults['intensity'].to_s,
        # Regra do plugin: nunca reenquadrar a captura — só o Reels pede 9:16.
        :aspect_ratio => vtype['id'].to_s == 'reels' ? defaults['aspectRatio'].to_s : 'auto',
        :scene => scene,
        :nodes => dur['nodes'].to_i,
        :eta_s => engine['estimatedSeconds'].to_i,
        :max_bytes => limits['maxSourceBytes'].to_i
      }
    end

    def execute_animar(spec)
      return emit_error(t(:busy)) if @generating

      @generating = true
      @generation_epoch = (@generation_epoch || 0) + 1
      @generation_started_at = Time.now
      @generation_context = { :mode => :animar, :spec => spec, :posted => false }
      epoch = @generation_epoch
      emit('status', { :stage => 'download', :message => t(:animar_prep) })

      settled = { :done => false }
      ::UI.start_timer(VIDEO_STAGE_TIMEOUT_SECONDS, false) do
        if generation_alive?(epoch) && !settled[:done]
          settled[:done] = true
          fail_generation('O download do render travou. Tente de novo.')
        end
      end

      http_request(:get, spec[:url], :auth => false) do |response|
        next unless generation_alive?(epoch) && !settled[:done]

        settled[:done] = true
        body = response.body.to_s
        status = response.status_code.to_i
        unless status >= 200 && status < 300 && image_bytes?(body)
          fail_generation('Não foi possível baixar o render pra animar.')
          next
        end
        if spec[:max_bytes] > 0 && body.bytesize > spec[:max_bytes]
          fail_generation('Este render é grande demais pra animar daqui — anime pelo site.')
          next
        end

        ext, mime = image_ext_and_mime(body)
        path = File.join(Dir.tmpdir, "spacenode-anim-#{SecureRandom.hex(4)}#{ext}")
        File.binwrite(path, body)

        emit('status', { :stage => 'upload', :message => t(:animar_sending) })
        upload_direct(path, mime, 'animar-source', false, epoch) do |key, _url|
          delete_quiet(path)
          request_animar(key, spec, epoch)
        end
      end
    rescue StandardError => e
      fail_generation(e.message)
    end

    # Todos os valores em STRING: a rota lê o corpo com str() e ignora
    # número/boolean. cameraMotion OMITIDO quando o preset é 'auto' — o
    # servidor resolve pela cena.
    def request_animar(key, spec, epoch)
      return unless generation_alive?(epoch)

      body = {
        :sourceKey => key,
        :engine => spec[:engine],
        :duration => spec[:duration],
        :videoType => spec[:video_type],
        :aspectRatio => spec[:aspect_ratio],
        :intensity => spec[:intensity],
        :fidelity => 'max',
        :avoidPeople => '1'
      }
      body[:scene] = spec[:scene] unless spec[:scene].to_s.empty?
      body[:cameraMotion] = spec[:motion] unless spec[:motion].to_s.empty? || spec[:motion] == 'auto'

      ctx = @generation_context
      ctx[:posted] = true if ctx
      eta_min = [(spec[:eta_s] / 60.0).round, 1].max
      emit('status', { :stage => 'animate', :message => "#{t(:animating)} #{format(t(:animar_eta), eta_min)}" })

      request = json_request(:post, '/api/video', body, animar_error_handler_for(epoch)) do |data|
        finish_animar(data, spec) if generation_alive?(epoch)
      end
      @generate_request = request

      ::UI.start_timer(GENERATE_TIMEOUT_SECONDS, false) do
        if generation_alive?(epoch) && @generate_request.equal?(request)
          begin
            request.cancel
          rescue StandardError
            nil
          end
          # Nunca falha seco: o servidor pode ter gerado e cobrado.
          reconcile_lost_video(epoch)
        end
      end
    end

    # Queda de rede DEPOIS do POST → reconcilia pelo histórico de vídeos;
    # erro HTTP (400/402/422/500) → falha normal (refund já aconteceu no servidor).
    def animar_error_handler_for(epoch)
      proc do |error|
        next unless generation_alive?(epoch)

        status = error.respond_to?(:status) ? error.status : nil
        if status.nil? || status.to_i.zero?
          reconcile_lost_video(epoch)
        else
          fail_generation(error.message, status == 401, status)
        end
      end
    end

    def reconcile_lost_video(epoch)
      return unless @generating && generation_alive?(epoch)

      started_at = @generation_started_at || Time.now
      spec = @generation_context && @generation_context[:spec]
      emit('status', { :stage => 'reconcile', :message => t(:animar_reconciling) })

      ::UI.start_timer(6, false) do
        next unless generation_alive?(epoch)

        on_fail = proc do |_e|
          fail_generation('Não foi possível confirmar o vídeo. Veja o Histórico no site antes de tentar de novo — os Nodes podem ter sido usados.') if generation_alive?(epoch)
        end
        json_request(:get, '/api/video/history?limit=5', nil, on_fail) do |data|
          next unless generation_alive?(epoch)

          videos = data['videos'].is_a?(Array) ? data['videos'] : []
          # Único em voo pelo lock @generating: o vídeo mais novo criado
          # depois do início (60 s de folga pra clock skew) é o nosso.
          found = videos.find do |v|
            begin
              v['output_url'].to_s.start_with?('http') && Time.parse(v['created_at'].to_s) >= started_at - 60
            rescue StandardError
              false
            end
          end
          if found
            finish_animar({
              'id' => found['id'], 'url' => found['output_url'],
              'nodesCharged' => found['cost_credits'], 'createdAt' => found['created_at']
            }, spec)
          else
            on_fail.call(nil)
          end
        end
      end
    end

    def finish_animar(data, spec)
      return unless @generating

      @generating = false
      @generation_context = nil
      @generate_request = nil
      spec ||= {}
      url = data['url'].to_s
      if url.empty?
        emit_error('A animação não devolveu resultado. Veja o Histórico no site.', false, true)
        return
      end

      video = {
        :videoId => data['id'],
        :videoUrl => url,
        # Pôster = o render já na tela — nunca o inputUrl do fal.storage.
        :posterUrl => spec[:url],
        :renderId => spec[:render_id],
        :sceneName => spec[:scene_name],
        :videoType => spec[:video_type],
        :engineLabel => spec[:engine_label],
        :duration => spec[:duration],
        :nodesCharged => data['nodesCharged'] || spec[:nodes],
        :totalBalance => data['totalBalance'],
        :createdAt => data['createdAt'] || Time.now.utc.iso8601,
        :localPath => nil
      }
      @last_video = video
      persist_last_video(video)
      if data['totalBalance'].is_a?(Numeric)
        @balance = { 'totalBalance' => data['totalBalance'] }
      else
        check_session
      end
      emit('videoResult', video)
      notify_video("#{t(:notif_video_ready)} · #{spec[:duration]} s")
      auto_save_video(video) if video_save_mode == 'project'
    end

    # Notificação nativa do SketchUp (o arquiteto pode estar modelando com o
    # painel atrás). SketchUp sem UI::Notification só não avisa.
    def notify_video(message)
      return unless defined?(::UI::Notification)

      ext = defined?(EXTENSION) ? EXTENSION : nil
      return unless ext

      n = ::UI::Notification.new(ext, message)
      n.on_accept(t(:notif_open_panel)) { |_n, _t| show_dialog }
      n.show
      @dialog.bring_to_front if @dialog && @dialog.respond_to?(:visible?) && @dialog.visible? && @dialog.respond_to?(:bring_to_front)
    rescue StandardError
      nil
    end

    # ── Vídeo no .skp e no disco ──

    def persist_last_video(video)
      model = ::Sketchup.active_model
      return unless model

      begin
        model.start_operation('SPACENODE', true, false, true)
        model.set_attribute('spacenode', 'last_video', JSON.generate(video))
        model.commit_operation
      rescue StandardError
        begin
          model.abort_operation
        rescue StandardError
          nil
        end
      end
    end

    def last_video_state
      video = @last_video
      unless video
        model = ::Sketchup.active_model
        stored = model && model.get_attribute('spacenode', 'last_video', nil)
        video = JSON.parse(stored) if stored.is_a?(String) && !stored.empty?
      end
      return nil unless video.is_a?(Hash)

      out = {}
      video.each { |k, v| out[k.to_s] = v }
      out['localExists'] = local_video_ok?(out['localPath'])
      out
    rescue StandardError
      nil
    end

    def remember_local_video(target)
      if @last_video
        @last_video[:localPath] = target
        persist_last_video(@last_video)
      else
        current = last_video_state
        return unless current

        current['localPath'] = target
        current.delete('localExists')
        persist_last_video(current)
      end
    rescue StandardError
      nil
    end

    def video_save_mode
      v = ::Sketchup.read_default(PREFERENCES_KEY, 'video_save', 'project').to_s
      %w[project ask].include?(v) ? v : 'project'
    end

    def video_slug(s)
      s = s.to_s
      begin
        s = s.unicode_normalize(:nfd).gsub(/[\u0300-\u036f]/, '')
      rescue StandardError
        nil
      end
      s.gsub(/[^A-Za-z0-9 _-]/, '').strip.gsub(/\s+/, '-').downcase[0, 40]
    end

    def video_file_name(video)
      model = ::Sketchup.active_model
      title = video_slug(model && model.title)
      scene_name = video[:sceneName] || video['sceneName']
      if scene_name.to_s.empty? && model
        begin
          page = model.pages.selected_page
          scene_name = page && page.name
        rescue StandardError
          scene_name = nil
        end
      end
      scene = video_slug(scene_name)
      parts = [title, scene].reject(&:empty?)
      parts = ['spacenode-video'] if parts.empty?
      duration = video[:duration] || video['duration']
      "#{parts.join('-')}-#{duration}s.mp4"
    end

    # <pasta do .skp>/spacenode-videos — nil quando o modelo nunca foi salvo.
    def video_dir
      model = ::Sketchup.active_model
      return nil unless model && !model.path.to_s.empty?

      dir = File.join(File.dirname(model.path), 'spacenode-videos')
      FileUtils.mkdir_p(dir) unless File.directory?(dir)
      dir
    rescue StandardError
      nil
    end

    # Nunca sobrescreve: -2, -3…
    def unique_path(path)
      return path unless File.exist?(path)

      base = path.sub(/\.mp4\z/i, '')
      i = 2
      i += 1 while File.exist?("#{base}-#{i}.mp4")
      "#{base}-#{i}.mp4"
    end

    def auto_save_video(video)
      dir = video_dir
      unless dir
        emit('videoSaveFailed', { :message => 'Salve o modelo (.skp) pra guardar o vídeo ao lado do projeto — ou use "Salvar vídeo…".' })
        return
      end

      target = unique_path(File.join(dir, video_file_name(video)))
      emit('status', { :stage => 'download', :message => t(:downloading_video) })
      download_to_file(video[:videoUrl], target, 4, :kind => :video, :auto => true)
    rescue StandardError => e
      emit('videoSaveFailed', { :message => "Não foi possível salvar o vídeo ao lado do projeto (#{e.message}). Use \"Salvar vídeo…\"." })
    end

    def save_video_to_disk(raw)
      payload = parse_json(raw)
      url = payload['url'].to_s
      url = (@last_video || {})[:videoUrl].to_s if url.empty?
      raise 'Nenhum vídeo pra salvar.' if url.empty? || url !~ %r{\Ahttps?://}

      suggested = video_file_name(@last_video || last_video_state || { :duration => '' })
      target = ::UI.savepanel(t(:save_video_title), video_dir || default_save_dir, suggested)
      return unless target

      target = "#{target}.mp4" unless target =~ /\.mp4\z/i # savepanel não força extensão
      emit('status', { :stage => 'download', :message => t(:downloading_video) })
      download_to_file(url, target, 4, :kind => :video)
    end

    # Arquivo local só é aberto/revelado se o Ruby o conhece (memória ou
    # atributo do .skp), tem extensão .mp4 e assinatura 'ftyp' — um caminho
    # forjado no .skp nunca vira ShellExecute.
    def local_video_ok?(path)
      path = path.to_s
      return false if path.empty? || path !~ /\.mp4\z/i || !File.file?(path)

      head = File.binread(path, 12)
      head.bytesize >= 12 && head.byteslice(4, 4) == 'ftyp'
    rescue StandardError
      false
    end

    def last_video_local_path
      v = @last_video || last_video_state
      p = v && (v[:localPath] || v['localPath'])
      local_video_ok?(p) ? p : nil
    end

    def open_last_video
      path = last_video_local_path
      if path
        if ::Sketchup.platform == :platform_win
          ::UI.openURL(path) # ShellExecute no app associado ao .mp4
        else
          system('open', path)
        end
        return
      end
      v = @last_video || last_video_state || {}
      url = (v[:videoUrl] || v['videoUrl']).to_s
      raise 'Nenhum vídeo pra abrir.' if url.empty?

      open_url(url)
    end

    def reveal_last_video
      path = last_video_local_path
      raise 'O vídeo ainda não está salvo neste computador.' unless path

      if ::Sketchup.platform == :platform_win
        system('explorer.exe', "/select,#{path.tr('/', '\\')}")
      else
        system('open', '-R', path)
      end
    rescue StandardError => e
      emit_error(e.message)
    end

    def save_result_to_disk(raw)
      payload = parse_json(raw)
      url = payload['url'].to_s
      raise 'Nenhum render pra salvar.' if url.empty?

      suggested = payload['suggestedName'].to_s
      suggested = "spacenode-render-#{Time.now.strftime('%Y%m%d-%H%M')}.png" if suggested.empty?
      # Diretório default explícito (não nil): remove qualquer dúvida de o
      # diálogo não abrir e dá um ponto de partida previsível.
      target = ::UI.savepanel(t(:save_title), default_save_dir, suggested)
      return unless target

      # savepanel não força extensão — garante um sufixo de imagem no destino.
      target = "#{target}.png" unless target =~ /\.(png|jpe?g|webp)\z/i

      emit('status', { :stage => 'download', :message => t(:downloading) })
      download_to_file(url, target, 4)
    end

    def default_save_dir
      base = ENV['USERPROFILE'] || ENV['HOME']
      return nil unless base

      desktop = File.join(base, 'Desktop')
      File.directory?(desktop) ? desktop : base
    rescue StandardError
      nil
    end

    # GET que segue redirects MANUALMENTE — Sketchup::Http::Request não segue
    # 3xx (o preview no CEF vê a imagem porque o Chromium segue sozinho; o
    # Http do SketchUp receberia só o stub do redirect). Grava em binário
    # ('wb') e valida a assinatura de imagem antes de escrever em disco.
    # kind: :image (render, default) ou :video (mp4 — assinatura 'ftyp').
    # Watchdog de DOWNLOAD_TIMEOUT_SECONDS (Sketchup::Http não tem timeout):
    # o estado é compartilhado entre os hops de redirect; cancel FORA do
    # callback de resposta. Vídeo com :auto => true (auto-save) falha em
    # aviso brando (videoSaveFailed) — o botão "Salvar vídeo…" segue vivo.
    def download_to_file(url, target, hops, opts = {})
      kind = opts[:kind] || :image
      state = opts[:state] || { :done => false }
      request = http_request(:get, url, :auth => false) do |response|
        next if state[:done]

        status = response.status_code.to_i

        if status >= 300 && status < 400
          location = redirect_location(response)
          if hops > 0 && location && !location.empty?
            download_to_file(absolute_url(location, url), target, hops - 1, opts.merge(:state => state))
          else
            state[:done] = true
            if kind == :video
              download_failed(kind, url, opts, 'redirecionamento inválido', status)
            else
              emit_error('Não foi possível baixar o render. Tente pelo site.')
              open_url(url)
            end
          end
          next
        end

        state[:done] = true
        body = response.body.to_s
        valid = kind == :video ? video_bytes?(body) : image_bytes?(body)
        if status >= 200 && status < 300 && valid
          begin
            File.open(target, 'wb') { |f| f.write(body) }
            if kind == :video
              remember_local_video(target)
              emit('saved', { :path => target, :kind => 'video', :auto => opts[:auto] ? true : false })
            else
              emit('saved', { :path => target, :kind => 'image' })
            end
          rescue StandardError => e
            emit_error("Não foi possível salvar o arquivo: #{e.message}")
          end
        else
          # Diagnóstico embutido: o motivo exato aparece pro usuário (e pra
          # nós) sem depender do Ruby Console — status + tamanho recebido.
          reason = status.zero? ? 'sem resposta do servidor' : "HTTP #{status}, #{body.bytesize} bytes"
          download_failed(kind, url, opts, reason, status)
        end
      end

      return if opts[:state] # hop de redirect: o watchdog já está armado

      ::UI.start_timer(DOWNLOAD_TIMEOUT_SECONDS, false) do
        unless state[:done]
          state[:done] = true
          begin
            request.cancel
          rescue StandardError
            nil
          end
          if kind == :video
            if opts[:auto]
              emit('videoSaveFailed', { :message => 'O download do vídeo travou. Tente "Salvar vídeo…".' })
            else
              emit_error('O download do vídeo travou. Tente "Salvar vídeo…" de novo.')
            end
          else
            emit_error('O download travou. Tente de novo.')
          end
        end
      end
    end

    def download_failed(kind, url, opts, reason, status)
      if kind == :video
        if opts[:auto]
          emit('videoSaveFailed', { :message => "Não foi possível salvar o vídeo ao lado do projeto (#{reason}). Use \"Salvar vídeo…\"." })
        else
          emit_error("Não foi possível baixar o vídeo (#{reason}). Use \"Abrir vídeo\".")
        end
      else
        emit_error("Não foi possível baixar o render (#{reason}). Use \"Abrir no site\".")
        open_url(url) if status >= 200 && status < 300
      end
    end

    # mp4/mov: 'ftyp' nos bytes 4..7 (o Veo real é 'ftypisom').
    def video_bytes?(body)
      !body.nil? && body.bytesize >= 12 && body.byteslice(4, 4) == 'ftyp'
    end

    # Extensão/mime pela assinatura — PNG, JPEG e WebP (preview do render).
    def image_ext_and_mime(body)
      bytes = body.byteslice(0, 12).bytes
      return ['.png', 'image/png'] if bytes[0, 4] == [0x89, 0x50, 0x4E, 0x47]
      return ['.webp', 'image/webp'] if bytes[0, 4] == [0x52, 0x49, 0x46, 0x46] && bytes[8, 4] == [0x57, 0x45, 0x42, 0x50]

      ['.jpg', 'image/jpeg']
    end

    # Location do response (headers é Hash; a chave pode variar de caixa).
    def redirect_location(response)
      headers = response.headers
      return nil unless headers.respond_to?(:each)

      found = nil
      headers.each { |k, v| found = v if k.to_s.downcase == 'location' }
      found.to_s
    rescue StandardError
      nil
    end

    # Resolve Location relativo contra a URL de origem (absoluto passa direto).
    def absolute_url(location, base)
      return location if location =~ %r{\Ahttps?://}

      uri = URI.parse(base)
      port = uri.port
      default_port = (uri.scheme == 'https' && port == 443) || (uri.scheme == 'http' && port == 80)
      host = "#{uri.scheme}://#{uri.host}#{default_port ? '' : ":#{port}"}"
      location.start_with?('/') ? "#{host}#{location}" : "#{host}/#{location}"
    rescue StandardError
      location
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

    # ── Ampliar (upscale) ────────────────────────────────────────────────────
    #
    # Duas etapas honestas: quote (baixa o render, mede as dimensões e mostra
    # o custo EXATO calculado da grade do catálogo) → confirmação → job.

    def handle_upscale_quote(raw)
      payload = parse_json(raw)
      url = payload['url'].to_s
      scale = payload['scale'].to_s
      raise 'Nenhum render pra ampliar.' if url.empty?
      raise 'Escala inválida.' unless %w[2x 4x].include?(scale)
      raise t(:busy) if @generating

      catalog = cached_catalog
      upscale_cfg = catalog && catalog['upscale']
      raise 'Reconecte pra atualizar o catálogo de custos.' unless upscale_cfg

      ensure_fresh_session(true) { start_upscale_quote(payload, url, scale, upscale_cfg) }
    end

    def start_upscale_quote(payload, url, scale, upscale_cfg)
      return emit_error(t(:busy)) if @generating

      old_pending = @upscale_pending
      @upscale_pending = nil
      delete_quiet(old_pending[:path]) if old_pending

      @generating = true
      @generation_epoch = (@generation_epoch || 0) + 1
      @generation_context = { :mode => :upscale_quote }
      epoch = @generation_epoch
      emit('status', { :stage => 'download', :message => 'Preparando a ampliação…' })

      settled = { :done => false }
      ::UI.start_timer(60, false) do
        if generation_alive?(epoch) && !settled[:done]
          settled[:done] = true
          fail_generation('O download do render travou. Tente de novo.')
        end
      end

      http_request(:get, url, :auth => false) do |response|
        next unless generation_alive?(epoch) && !settled[:done]

        settled[:done] = true
        body = response.body.to_s
        status = response.status_code.to_i
        unless status >= 200 && status < 300 && image_bytes?(body)
          fail_generation('Não foi possível baixar o render pra ampliar.')
          next
        end

        dims = image_dimensions(body)
        unless dims
          fail_generation('Não foi possível medir o render. Tente pelo site.')
          next
        end

        ext, mime = image_ext_and_mime(body)
        path = File.join(Dir.tmpdir, "spacenode-up-#{SecureRandom.hex(4)}#{ext}")
        File.binwrite(path, body)

        nodes = upscale_cost_for(upscale_cfg, scale, dims[0], dims[1])
        factor = (upscale_cfg['scaleFactor'] || {})[scale].to_i
        factor = scale == '4x' ? 4 : 2 if factor <= 0
        output_mp = (dims[0].to_f * dims[1] * factor * factor) / 1_000_000.0
        max_mp = upscale_cfg['maxOutputMP'].to_i
        if max_mp > 0 && output_mp > max_mp
          delete_quiet(path)
          fail_generation("Essa ampliação passaria de #{max_mp} MP. Use uma escala menor.")
          next
        end

        # Quote pronto: solta o lock — o job só arma de novo na confirmação.
        @generating = false
        @generation_context = nil
        @upscale_pending = {
          :path => path, :mime => mime, :scale => scale, :nodes => nodes,
          :width => dims[0], :height => dims[1]
        }
        emit('status', { :stage => 'idle', :message => '' })
        emit('upscaleQuote', {
          :scale => scale, :nodes => nodes,
          :width => dims[0], :height => dims[1]
        })
      end
    end

    def upscale_cost_for(cfg, scale, width, height)
      base = 0
      (cfg['modes'] || []).each do |mode|
        next unless mode['id'] == 'fidelity'

        (mode['scales'] || []).each do |s|
          base = s['baseNodes'].to_i if s['id'] == scale
        end
      end
      mp = (width.to_f * height) / 1_000_000.0
      surcharge = 0
      (cfg['mpSurchargeTiers'] || []).each do |tier|
        max = tier['maxMP']
        if max.nil? || mp <= max.to_f
          surcharge = tier['add'].to_i
          break
        end
      end
      base + surcharge
    end

    def run_upscale
      pending = @upscale_pending
      raise 'Nada pra confirmar.' unless pending
      raise t(:busy) if @generating

      ensure_fresh_session(true) { execute_upscale(pending) }
    end

    def execute_upscale(pending)
      return emit_error(t(:busy)) if @generating

      @upscale_pending = nil
      @generating = true
      @generation_epoch = (@generation_epoch || 0) + 1
      @generation_started_at = Time.now
      @generation_context = { :mode => :upscale }
      epoch = @generation_epoch
      emit('status', { :stage => 'upload', :message => 'Enviando pra ampliação…' })

      upload_direct(pending[:path], pending[:mime], 'upscale-source', false, epoch) do |key, _url|
        delete_quiet(pending[:path])
        body = {
          :sourceKey => key,
          :tab => 'resolution',
          :modeId => 'fidelity',
          :scale => pending[:scale],
          :objectiveId => 'client'
        }
        emit('status', { :stage => 'generate', :message => t(:upscaling) })
        request = json_request(:post, '/api/upscale', body, direct_error_handler_for(epoch, 'A conexão caiu durante a ampliação. Veja o Histórico antes de tentar de novo — os Nodes podem ter sido usados.')) do |data|
          next unless generation_alive?(epoch)

          @generating = false
          @generation_context = nil
          url = data['url'].to_s
          if url.empty?
            emit_error('A ampliação não devolveu resultado. Veja o Histórico.', false, true)
          else
            previous = @last_result || {}
            result = {
              :outputUrl => url,
              :previewUrl => url,
              :originalUrl => data['originalUrl'],
              :nodesCharged => pending[:nodes],
              :seed => previous[:seed],
              :camera => previous[:camera],
              :upscaled => pending[:scale]
            }
            @last_result = result
            persist_last_result(result)
            emit('result', result)
            check_session
          end
        end
        @generate_request = request
        ::UI.start_timer(GENERATE_TIMEOUT_SECONDS, false) do
          if generation_alive?(epoch) && @generate_request.equal?(request)
            begin
              request.cancel
            rescue StandardError
              nil
            end
            fail_generation('A ampliação demorou demais. Veja o Histórico antes de tentar de novo — os Nodes podem ter sido usados.')
          end
        end
      end
    end

    # ── Editar (V3, por instrução) ──────────────────────────────────────────

    def handle_edit_quote(raw)
      payload = parse_json(raw)
      source = payload['sourceUrl'].to_s
      return if source.empty? || !authenticated?
      # Quote é cosmético: com token vencido, pular em silêncio (um 401 aqui
      # deslogaria o usuário no meio da digitação via handle_auth_failure).
      return unless session_fresh?

      body = build_edit_body(payload, source, true)
      return unless body

      quote_id = payload['quoteId']
      json_request(:post, '/api/edit-v3/google', body, proc { |_e| emit('editQuote', { :quoteId => quote_id, :nodes => nil }) }) do |data|
        emit('editQuote', { :quoteId => quote_id, :nodes => data['nodes_cost'] })
      end
    end

    def handle_apply_edit(raw)
      payload = parse_json(raw)
      raise t(:connect_first) unless authenticated?
      raise t(:busy) if @generating

      source = payload['sourceUrl'].to_s
      raise 'Nenhum render pra editar.' if source.empty?

      ensure_fresh_session(true) { execute_apply_edit(payload, source) }
    end

    def execute_apply_edit(payload, source)
      return emit_error(t(:busy)) if @generating

      @generating = true
      @generation_epoch = (@generation_epoch || 0) + 1
      @generation_started_at = Time.now
      @generation_context = { :mode => :edit }
      epoch = @generation_epoch

      # Cadeia: máscara da área selecionada → amostra de material → requisição.
      upload_edit_mask(payload, epoch) do |mask_url|
        upload_edit_reference(payload, epoch) do |reference_url|
          request_edit(payload, source, reference_url, mask_url, epoch)
        end
      end
    end

    # Máscara da área que o usuário pintou no preview (PNG branco-no-preto,
    # já na proporção da fonte). Vai pela área retocar-asset (kind mask).
    def upload_edit_mask(payload, epoch, &done)
      data_url = payload['maskDataUrl'].to_s
      if data_url.empty?
        done.call(nil)
        return
      end

      b64 = data_url.sub(%r{\Adata:image/png;base64,}, '')
      tmp = File.join(Dir.tmpdir, "spacenode-mask-#{SecureRandom.hex(4)}.png")
      File.binwrite(tmp, Base64.decode64(b64))
      emit('status', { :stage => 'upload', :message => 'Enviando a área selecionada…' })
      upload_direct(tmp, 'image/png', 'retocar-asset', true, epoch, :optional => true, :params => { :kind => 'mask' }) do |_key, url|
        delete_quiet(tmp)
        done.call(url && !url.empty? ? url : nil)
      end
    rescue StandardError
      done.call(nil)
    end

    def upload_edit_reference(payload, epoch, &done)
      reference_name = payload['referenceMaterial'].to_s
      if payload['action'] != 'swap_material' || reference_name.empty?
        done.call(nil)
        return
      end

      exported = export_material_texture(::Sketchup.active_model, reference_name)
      # Contrato novo: sempre Hash — { :path, :mime } ou { :error }. Testar
      # só a verdade do Hash mandava path nil pro upload e prendia @generating.
      if exported[:error]
        done.call(nil)
        return
      end
      emit('status', { :stage => 'upload', :message => 'Enviando a amostra do material…' })
      upload_direct(exported[:path], exported[:mime], 'retocar-reference', true, epoch, :optional => true) do |_k, url|
        delete_quiet(exported[:path])
        done.call(url && !url.empty? ? url : nil)
      end
    end

    def request_edit(payload, source, reference_url, mask_url, epoch)
      return unless generation_alive?(epoch)

      has_mask = mask_url && !mask_url.empty?
      body = build_edit_body(payload, source, false, has_mask)
      unless body
        fail_generation('Descreva o que deseja alterar ou selecione uma área.')
        return
      end
      body[:mask_url] = mask_url if has_mask
      has_reference = reference_url && !reference_url.empty?
      body[:references] = [{ :kind => 'material', :url => reference_url }] if has_reference
      # Amostra escolhida mas perdida no upload + sem instrução = nada pra
      # mandar; e com instrução, avisa que vai só pela descrição.
      if payload['action'] == 'swap_material' && !payload['referenceMaterial'].to_s.empty? && !has_reference
        if payload['instruction'].to_s.strip.empty?
          fail_generation('Não foi possível enviar a amostra do material. Tente de novo ou descreva o material desejado.')
          return
        end
        emit('status', { :stage => 'generate', :message => 'Amostra não enviada — editando pela descrição…' })
      end

      emit('status', { :stage => 'generate', :message => t(:editing) })
      request = json_request(:post, '/api/edit-v3/google', body, direct_error_handler_for(epoch, 'A conexão caiu durante a edição. Veja o Histórico antes de tentar de novo — os Nodes podem ter sido usados.')) do |data|
        next unless generation_alive?(epoch)

        @generating = false
        @generation_context = nil
        if data['rejected']
          # O motivo real vem em reasons[0]; message é o rodapé genérico.
          reason = Array(data['reasons']).first
          emit('editRejected', { :message => [reason, data['message']].compact.join(' ').strip })
          emit('status', { :stage => 'idle', :message => '' })
        else
          url = data['result_url'].to_s
          if url.empty?
            emit_error('A edição não devolveu resultado.', false, true)
          else
            previous = @last_result || {}
            result = {
              :outputUrl => url,
              :previewUrl => url,
              :originalUrl => source,
              :nodesCharged => data['nodes_cost'],
              :seed => previous[:seed],
              :camera => previous[:camera],
              :edited => payload['action'].to_s
            }
            @last_result = result
            persist_last_result(result)
            emit('result', result)
            check_session
          end
        end
      end
      @generate_request = request
      ::UI.start_timer(GENERATE_TIMEOUT_SECONDS, false) do
        if generation_alive?(epoch) && @generate_request.equal?(request)
          begin
            request.cancel
          rescue StandardError
            nil
          end
          fail_generation('A edição demorou demais. Veja o Histórico antes de tentar de novo — os Nodes podem ter sido usados.')
        end
      end
    end

    def build_edit_body(payload, source, dry_run, has_mask = false)
      action = payload['action'].to_s
      return nil unless %w[remove swap_material refine_area].include?(action)

      instruction = payload['instruction'].to_s.strip
      # remove/refine COM área selecionada não exigem instrução — a máscara já
      # diz ONDE, e a ação já diz O QUÊ.
      mask_action = has_mask && %w[remove refine_area].include?(action)
      return nil if instruction.empty? && !dry_run && !mask_action && payload['referenceMaterial'].to_s.empty?

      body = {
        :action => action,
        :source_image_url => source,
        :quality => 'standard',
        :preservation => 'maximum',
        :intensity => 'standard',
        :output_resolution => 'source'
      }
      body[:instruction] = instruction unless instruction.empty?
      body[:dry_run] = true if dry_run
      body
    end

    # ── Criar Space das cenas ───────────────────────────────────────────────
    #
    # A máquina de estados do Spaces (draft → mestre → DNA → lock → prints →
    # generate) roda inteira aqui, invisível pro arquiteto. A vista mestre é
    # a VISTA ATUAL; as cenas selecionadas viram prints (autoridade
    # geométrica própria + identidade do DNA por cima).

    def handle_create_space(raw)
      payload = parse_json(raw)
      raise t(:connect_first) unless authenticated?
      raise t(:busy) if @generating

      ensure_fresh_session(true) { execute_create_space(payload) }
    end

    def execute_create_space(payload)
      return emit_error(t(:busy)) if @generating

      name = payload['name'].to_s.strip
      name = default_space_name if name.empty?
      category = %w[residencial comercial conceito].include?(payload['category']) ? payload['category'] : 'residencial'
      engine = payload['engine'].to_s
      quality = payload['quality'].to_s
      scenes = Array(payload['scenes']).select { |s| s.is_a?(Hash) }.first(10)
      raise 'Selecione ao menos uma cena pros prints.' if scenes.empty?

      model = ::Sketchup.active_model
      raise 'Nenhum modelo aberto no SketchUp.' unless model

      original = nil
      begin
        pages = model.pages
        pages.each_with_index do |page, index|
          original = index if pages.selected_page && page.equal?(pages.selected_page)
        end
      rescue StandardError
        original = nil
      end

      @generating = true
      @generation_epoch = (@generation_epoch || 0) + 1
      @generation_started_at = Time.now
      @generation_context = {
        :mode => :space, :original_scene => original,
        :space_name => name,
        :vistas => [], :vista_errors => []
      }
      epoch = @generation_epoch
      ctx = @generation_context

      space_progress(1, 'Criando o Space…')
      json_request(:post, '/api/spaces', { :name => name, :category => category, :engine => engine }, direct_error_handler_for(epoch, 'Sem conexão ao criar o Space. Nada foi cobrado — tente de novo.')) do |data|
        next unless generation_alive?(epoch)

        space = data['space'] || {}
        space_id = space['id'].to_s
        if space_id.empty?
          fail_generation('Não foi possível criar o Space.')
        else
          ctx[:space_id] = space_id
          space_upload_master(space_id, quality, scenes, engine, epoch)
        end
      end
    end

    def default_space_name
      model = ::Sketchup.active_model
      title = model && model.title.to_s
      title.nil? || title.empty? ? "Projeto SketchUp #{Time.now.strftime('%d/%m')}" : title[0, 80]
    rescue StandardError
      "Projeto SketchUp #{Time.now.strftime('%d/%m')}"
    end

    def space_progress(step, message)
      emit('spaceProgress', { :step => step, :total => 6, :message => message })
      emit('status', { :stage => 'generate', :message => message })
    end

    def space_upload_master(space_id, quality, scenes, engine, epoch)
      ensure_fresh_session(:space) { space_upload_master_now(space_id, quality, scenes, engine, epoch) }
    end

    def space_upload_master_now(space_id, quality, scenes, engine, epoch)
      # A renovação de sessão é assíncrona: um Cancelar nesse intervalo não
      # pode deixar a etapa seguir (e cobrar) depois.
      return unless generation_alive?(epoch)

      space_progress(2, 'Enviando a vista mestre…')
      # capture/File podem levantar dentro de callback HTTP — sem este rescue
      # o @generating ficaria preso (o rescue genérico do http_request não
      # encerra a geração).
      begin
        capture = capture_viewport(quality.empty? ? '2k' : quality)
        master_path = capture[:path]
        mime = @last_capture_mime || 'image/png'
        size = File.size(master_path)
      rescue StandardError => e
        fail_generation(e.message)
        return
      end

      sign_body = { :contentType => mime, :sizeBytes => size }
      json_request(:post, "/api/spaces/#{space_id}/upload-vista-mestre/sign", sign_body, direct_error_handler_for(epoch, 'Sem conexão ao enviar a vista mestre. O Space ficou criado — continue pelo site ou tente de novo.')) do |sign|
        next unless generation_alive?(epoch)

        upload_url = sign['uploadUrl'].to_s
        key = sign['key'].to_s
        if upload_url.empty? || key.empty?
          fail_generation('Não foi possível preparar a vista mestre.')
          next
        end

        http_request(:put, upload_url, :body => File.binread(master_path), :content_type => mime, :auth => false) do |response|
          next unless generation_alive?(epoch)

          delete_quiet(master_path)
          unless response.status_code.to_i.between?(200, 299)
            fail_generation('Falha no envio da vista mestre.')
            next
          end

          json_request(:post, "/api/spaces/#{space_id}/upload-vista-mestre/confirm", { :key => key }, direct_error_handler_for(epoch, 'Sem conexão ao confirmar a vista mestre. O Space ficou criado — continue pelo site.')) do |_confirm|
            next unless generation_alive?(epoch)

            space_extract_dna(space_id, quality, scenes, engine, epoch)
          end
        end
      end
    end

    def space_extract_dna(space_id, quality, scenes, engine, epoch)
      ensure_fresh_session(:space) { space_extract_dna_now(space_id, quality, scenes, engine, epoch) }
    end

    def space_extract_dna_now(space_id, quality, scenes, engine, epoch)
      return unless generation_alive?(epoch)

      space_progress(3, 'Extraindo o DNA do projeto…')
      json_request(:post, "/api/spaces/#{space_id}/extract-dna", {}, direct_error_handler_for(epoch, 'A conexão caiu na extração do DNA — os 8 Nodes podem ter sido usados. Confira o Space no site antes de repetir.')) do |_data|
        next unless generation_alive?(epoch)

        space_progress(4, 'Travando a identidade…')
        json_request(:post, "/api/spaces/#{space_id}/lock", {}, direct_error_handler_for(epoch, 'Sem conexão ao travar a identidade. Continue pelo site — o DNA já foi extraído.')) do |_lock|
          next unless generation_alive?(epoch)

          space_upload_prints(space_id, quality, scenes, engine, epoch, scenes.dup, [])
        end
      end
    end

    def space_upload_prints(space_id, quality, scenes, engine, epoch, queue, prints)
      return unless generation_alive?(epoch)

      if queue.empty?
        space_generate_vistas(space_id, quality, engine, epoch, prints)
        return
      end

      entry = queue.shift
      index = entry['index'].to_i
      expected_name = entry['name'].to_s
      model = ::Sketchup.active_model
      page = nil
      begin
        pages = model.pages
        page = pages[index]
        if page && !expected_name.empty? && page.name.to_s != expected_name
          match = nil
          pages.each { |p| match = p if match.nil? && p.name.to_s == expected_name }
          page = match
        end
        apply_page_for_capture(model, page) if page
      rescue StandardError
        page = nil
      end

      unless page
        space_upload_prints(space_id, quality, scenes, engine, epoch, queue, prints)
        return
      end

      space_progress(5, "Enviando cena #{prints.length + 1} de #{scenes.length}…")
      begin
        # Área spaces-sketch aceita 10 MB (não os 15 da render-source) — o
        # fallback JPEG da captura precisa disparar antes desse teto.
        capture = capture_viewport(quality.empty? ? '2k' : quality, :max_bytes => 9_500_000)
      rescue StandardError => e
        fail_generation(e.message)
        return
      end
      upload_direct(capture[:path], @last_capture_mime || 'image/png', 'spaces-sketch', true, epoch,
                    :optional => true, :params => { :spaceId => space_id }) do |_key, url|
        delete_quiet(capture[:path])
        if url && !url.empty?
          prints << { :url => url, :label => page.name.to_s[0, 48] }
        else
          # Cena perdida NUNCA some em silêncio — entra no resumo final.
          ctx = @generation_context
          ctx[:vista_errors] << { 'label' => page.name.to_s, 'error' => 'Falha ao enviar a cena.' } if ctx
        end
        space_upload_prints(space_id, quality, scenes, engine, epoch, queue, prints)
      end
    end

    def space_generate_vistas(space_id, quality, engine, epoch, prints)
      return unless generation_alive?(epoch)

      if prints.empty?
        fail_generation('Nenhuma cena pôde ser enviada. O Space ficou criado — continue pelo site.')
        return
      end

      ctx = @generation_context
      chunks = prints.each_slice(4).to_a
      space_generate_chunk(space_id, quality, epoch, chunks, 0, prints.length)
    end

    def space_generate_chunk(space_id, quality, epoch, chunks, done_count, total)
      return unless generation_alive?(epoch)

      ctx = @generation_context
      if chunks.empty?
        finish_space(space_id)
        return
      end
      # Cada bloco de vistas pode levar minutos — renova antes se preciso.
      ensure_fresh_session(:space) { space_generate_chunk_now(space_id, quality, epoch, chunks, done_count, total) }
    end

    def space_generate_chunk_now(space_id, quality, epoch, chunks, done_count, total)
      return unless generation_alive?(epoch)

      ctx = @generation_context

      chunk = chunks.shift
      space_progress(6, "Gerando vistas (#{done_count + chunk.length} de #{total})…")
      body = {
        :action => 'nova_vista',
        :reference => { :kind => 'print', :prints => chunk },
        :quality => quality.empty? ? '2k' : quality
      }
      request = json_request(:post, "/api/spaces/#{space_id}/generate", body, direct_error_handler_for(epoch, 'A conexão caiu gerando as vistas. As concluídas ficaram salvas — veja o Space no site.')) do |data|
        next unless generation_alive?(epoch)

        ctx[:vistas].concat(Array(data['vistas']))
        ctx[:vista_errors].concat(Array(data['errors']))
        balance = data['balance_after']
        @balance = { 'totalBalance' => balance['total_balance'] } if balance.is_a?(Hash) && balance['total_balance']
        space_generate_chunk(space_id, quality, epoch, chunks, done_count + chunk.length, total)
      end
      @generate_request = request
      ::UI.start_timer(GENERATE_TIMEOUT_SECONDS, false) do
        if generation_alive?(epoch) && @generate_request.equal?(request)
          begin
            request.cancel
          rescue StandardError
            nil
          end
          fail_generation('A geração das vistas demorou demais. O Space ficou criado — veja pelo site.')
        end
      end
    end

    def finish_space(space_id)
      ctx = @generation_context
      @generating = false
      @generation_context = nil
      @generate_request = nil
      restore_original_scene(ctx)

      vistas = (ctx && ctx[:vistas]) || []
      errors = (ctx && ctx[:vista_errors]) || []
      emit('spaceDone', {
        :spaceId => space_id,
        :spaceUrl => "#{api_base_url}/app/spaces/#{space_id}",
        :name => ctx && ctx[:space_name],
        :vistas => vistas.map { |v| { :url => v['image_url'], :label => v['axis_label'] } },
        :errors => errors
      })
      emit('status', { :stage => 'idle', :message => '' })
      send_state
    end

    # ── Configurações ────────────────────────────────────────────────────────

    def handle_save_settings(raw)
      payload = parse_json(raw)

      requested_locale = payload['locale'].to_s
      if %w[auto pt en].include?(requested_locale)
        ::Sketchup.write_default(PREFERENCES_KEY, 'locale', requested_locale)
      end

      # Tema do painel: 'auto' resolve no JS (escolha local → preferência da
      # conta → tema do SO → escuro); 'light'/'dark' são override manual,
      # mesmo padrão do override de idioma acima.
      requested_theme = payload['theme'].to_s
      if %w[auto light dark].include?(requested_theme)
        ::Sketchup.write_default(PREFERENCES_KEY, 'theme', requested_theme)
      end

      # Vídeos: 'project' = salva sozinho em <pasta do .skp>/spacenode-videos;
      # 'ask' = só pelo botão "Salvar vídeo…".
      requested_video_save = payload['videoSave'].to_s
      if %w[project ask].include?(requested_video_save)
        ::Sketchup.write_default(PREFERENCES_KEY, 'video_save', requested_video_save)
      end

      # Só mexe no servidor quando o painel manda a chave — trocar tema ou
      # idioma não pode gravar um campo de URL meio digitado e derrubar a
      # sessão (trocar de servidor limpa a sessão de propósito).
      if payload.key?('apiBaseUrl')
        next_url = normalize_api_base_url(payload['apiBaseUrl'].to_s)
        current_url = api_base_url

        ::Sketchup.write_default(PREFERENCES_KEY, 'api_base_url', next_url)
        if next_url != current_url
          clear_session
          @catalog = nil
          @balance = nil
          ::Sketchup.write_default(PREFERENCES_KEY, 'catalog_json', '')
        end
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
        :devicePaired => device_paired?,
        :locale => locale,
        :localeSetting => ::Sketchup.read_default(PREFERENCES_KEY, 'locale', 'auto').to_s,
        :themeSetting => ::Sketchup.read_default(PREFERENCES_KEY, 'theme', 'auto').to_s,
        :accountTheme => @account_theme,
        :userEmail => ::Sketchup.read_default(PREFERENCES_KEY, 'user_email', '').to_s,
        :version => VERSION,
        :balance => @balance,
        :panelState => panel_state,
        :lastResult => @last_result || model_result,
        :videoSave => video_save_mode,
        :lastVideo => last_video_state
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

      # PNG nas DUAS plataformas: o renderizador de SVG do SketchUp no Windows
      # exibe ícones feitos só de stroke (sem fill) em branco/preto — o botão
      # parecia inexistente. PNG rasterizado é confiável. Caminho absoluto.
      icon_base = File.join(__dir__, 'assets')
      small_icon = File.join(icon_base, 'spacenode-24.png')
      large_icon = File.join(icon_base, 'spacenode-48.png')
      if File.exist?(small_icon)
        command.small_icon = small_icon
        command.large_icon = File.exist?(large_icon) ? large_icon : small_icon
      end

      ::UI.menu('Extensions').add_item(command)

      toolbar = ::UI::Toolbar.new('SPACENODE')
      toolbar.add_item(command)
      # restore sozinho NÃO exibe no primeiro load (get_last_state
      # TB_NEVER_SHOWN) — só reposiciona se já foi mostrada antes. show força
      # a exibição na estreia; nas próximas sessões restore respeita a escolha
      # do usuário (se ele fechou a barra, fica fechada).
      begin
        never_shown = defined?(TB_NEVER_SHOWN) ? TB_NEVER_SHOWN : -1
        if toolbar.get_last_state == never_shown
          toolbar.show
        else
          toolbar.restore
        end
      rescue StandardError
        toolbar.restore
      end

      file_loaded(__FILE__)
    end
  end
end
