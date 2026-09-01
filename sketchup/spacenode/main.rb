# frozen_string_literal: true

require 'sketchup.rb'
require 'base64'
require 'fileutils'
require 'json'
require 'net/http'
require 'securerandom'
require 'time'
require 'tmpdir'
require 'uri'

module SpaceNode
  module SketchUp
    extend self

    VERSION = '0.1.0'
    PREFERENCES_KEY = 'com.spacenode.sketchup'
    DEFAULT_API_BASE_URL = 'https://spacenode.app'
    MAX_CAPTURE_EDGE = 1600
    CAPTURE_QUALITY = 0.9

    class ApiError < StandardError
      attr_reader :status

      def initialize(message, status = nil)
        super(message)
        @status = status
      end
    end

    def activate
      show_dialog
    end

    def show_dialog
      if @dialog && @dialog.respond_to?(:visible?) && @dialog.visible?
        @dialog.bring_to_front if @dialog.respond_to?(:bring_to_front)
        send_state
        return
      end

      @dialog = UI::HtmlDialog.new(
        :dialog_title => 'SpaceNode',
        :preferences_key => PREFERENCES_KEY,
        :scrollable => false,
        :resizable => true,
        :width => 420,
        :height => 720,
        :min_width => 360,
        :min_height => 540,
        :style => dialog_style
      )
      attach_callbacks(@dialog)
      @dialog.set_file(File.join(__dir__, 'dialog.html'))
      @dialog.set_on_closed { @dialog = nil }
      @dialog.show
    end

    def dialog_style
      defined?(UI::HtmlDialog::STYLE_DIALOG) ? UI::HtmlDialog::STYLE_DIALOG : 1
    end

    def attach_callbacks(dialog)
      dialog.add_action_callback('ready') { |_ctx| send_state }
      dialog.add_action_callback('captureViewport') { |_ctx| handle_capture }
      dialog.add_action_callback('generate') { |_ctx, raw| handle_generate(raw) }
      dialog.add_action_callback('connect') { |_ctx| show_auth_dialog }
      dialog.add_action_callback('disconnect') { |_ctx| clear_session; send_state }
      dialog.add_action_callback('checkSession') { |_ctx| check_session }
      dialog.add_action_callback('saveSettings') { |_ctx, raw| handle_save_settings(raw) }
      dialog.add_action_callback('openUrl') { |_ctx, url| open_url(url) }
    end

    def handle_capture
      path = capture_viewport
      @last_capture_path = path
      emit('capture', {
        :ok => true,
        :imageDataUrl => data_url_for_file(path),
        :fileName => File.basename(path),
        :capturedAt => Time.now.iso8601
      })
    rescue StandardError => e
      emit_error(e.message)
    end

    def handle_generate(raw)
      payload = parse_json(raw)
      ensure_authenticated!

      if payload['freshCapture'] || @last_capture_path.nil? || !File.exist?(@last_capture_path)
        @last_capture_path = capture_viewport
        emit('capture', {
          :ok => true,
          :imageDataUrl => data_url_for_file(@last_capture_path),
          :fileName => File.basename(@last_capture_path),
          :capturedAt => Time.now.iso8601
        })
      end

      request_body = build_generate_payload(payload, @last_capture_path)
      emit('status', { :message => 'Gerando na SpaceNode...' })

      Thread.new do
        begin
          data = post_json('/api/generate', request_body)
          result = {
            :outputUrl => data['outputUrl'],
            :previewUrl => data['previewUrl'],
            :renderId => data['renderId'],
            :webUrl => data['outputUrl'],
            :nodesCharged => data['nodesCharged'],
            :totalBalance => data['totalBalance'],
            :fidelityWarning => data['fidelityWarning'] || data['semanticWarning']
          }
          @last_result = result
          emit('result', result)
        rescue ApiError => e
          clear_session if e.status == 401
          emit_error(e.message, e.status == 401)
        rescue StandardError => e
          emit_error(e.message)
        end
      end
    rescue StandardError => e
      emit_error(e.message)
    end

    def handle_save_settings(raw)
      payload = parse_json(raw)
      next_url = normalize_api_base_url(payload['apiBaseUrl'].to_s)
      current_url = api_base_url

      Sketchup.write_default(PREFERENCES_KEY, 'api_base_url', next_url)
      clear_session if next_url != current_url
      send_state
    rescue StandardError => e
      emit_error(e.message)
    end

    def show_auth_dialog
      @auth_dialog.close if @auth_dialog && @auth_dialog.respond_to?(:close)

      @auth_dialog = UI::HtmlDialog.new(
        :dialog_title => 'Conectar SpaceNode',
        :preferences_key => "#{PREFERENCES_KEY}.auth",
        :scrollable => false,
        :resizable => true,
        :width => 420,
        :height => 560,
        :min_width => 360,
        :min_height => 460,
        :style => dialog_style
      )

      @auth_dialog.add_action_callback('receiveSpaceNodeSession') do |_ctx, raw|
        save_session(raw)
        @auth_dialog.close if @auth_dialog.respond_to?(:close)
        send_state
        check_session
      rescue StandardError => e
        emit_error(e.message)
      end

      @auth_dialog.set_url("#{api_base_url}/sketchup/connect")
      @auth_dialog.show
    end

    def check_session
      ensure_authenticated!
      emit('status', { :message => 'Verificando sessão...' })

      Thread.new do
        begin
          data = get_json('/api/sketchup/session')
          emit('session', data)
        rescue ApiError => e
          clear_session if e.status == 401
          emit_error(e.message, e.status == 401)
          send_state if e.status == 401
        rescue StandardError => e
          emit_error(e.message)
        end
      end
    rescue StandardError => e
      emit_error(e.message, e.message.include?('Conecte'))
    end

    def build_generate_payload(payload, capture_path)
      prompt = payload['prompt'].to_s.strip
      raise 'Descreva o que a SpaceNode deve renderizar.' if prompt.empty?

      mode = payload['mode'] == 'fast' ? 'fast' : 'quality'
      project_type = payload['projectType'] == 'exterior' ? 'exterior' : 'interior'
      segment = payload['segment'].to_s.strip
      environment = payload['environment'].to_s.strip
      lighting = payload['lighting'].to_s.strip

      {
        :imageBase64 => data_url_for_file(capture_path),
        :projectType => project_type,
        :segment => segment.empty? ? 'Residencial' : segment,
        :environment => environment,
        :lighting => lighting,
        :background => 'Preservar Original',
        :sceneElements => [],
        :geometryLock => mode == 'fast' ? 78 : 92,
        :fidelityMode => mode == 'fast' ? 'balanced' : 'strict',
        :fidelityLevel => mode == 'fast' ? 'balanced' : 'maximum',
        :engine => mode == 'fast' ? 'pulsar' : 'vega',
        :resolution => mode == 'fast' ? 'hd' : '2k',
        :refinementText => prompt
      }
    end

    def capture_viewport
      model = ::Sketchup.active_model
      raise 'Nenhum modelo ativo no SketchUp.' unless model

      view = model.active_view
      width = [view.vpwidth.to_i, 1].max
      height = [view.vpheight.to_i, 1].max
      max_side = [width, height].max

      if max_side > MAX_CAPTURE_EDGE
        scale = MAX_CAPTURE_EDGE.to_f / max_side
        width = [(width * scale).round, 1].max
        height = [(height * scale).round, 1].max
      end

      path = File.join(Dir.tmpdir, "spacenode-viewport-#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{SecureRandom.hex(3)}.jpg")
      ok = view.write_image(
        :filename => path,
        :width => width,
        :height => height,
        :antialias => true,
        :compression => CAPTURE_QUALITY
      )
      raise 'Não foi possível capturar o viewport atual.' unless ok && File.exist?(path)

      path
    end

    def data_url_for_file(path)
      "data:image/jpeg;base64,#{Base64.strict_encode64(File.binread(path))}"
    end

    def post_json(path, body)
      request_json(:post, path, body)
    end

    def get_json(path)
      request_json(:get, path)
    end

    def request_json(method, path, body = nil)
      uri = URI.parse("#{api_base_url}#{path}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      http.open_timeout = 20
      http.read_timeout = 320

      request = method == :post ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
      request['Accept'] = 'application/json'
      request['Authorization'] = "Bearer #{access_token}"
      request['Content-Type'] = 'application/json' if method == :post
      request['User-Agent'] = "SpaceNode SketchUp/#{VERSION}"
      request.body = JSON.generate(body) if body

      response = http.request(request)
      data = parse_response(response)
      return data if response.is_a?(Net::HTTPSuccess)

      message = data['error'] || data['message'] || "Erro HTTP #{response.code}"
      raise ApiError.new(message, response.code.to_i)
    rescue JSON::ParserError
      raise ApiError.new('A SpaceNode respondeu em um formato inesperado.')
    rescue SocketError, Errno::ECONNREFUSED, Net::OpenTimeout, Net::ReadTimeout => e
      raise ApiError.new("Não foi possível conectar à SpaceNode: #{e.message}")
    end

    def parse_response(response)
      body = response.body.to_s
      body.empty? ? {} : JSON.parse(body)
    end

    def save_session(raw)
      payload = parse_json(raw)
      token = payload['accessToken'].to_s
      raise 'Sessão inválida recebida da SpaceNode.' if token.empty?

      expires_at = payload['expiresAt'].to_i
      Sketchup.write_default(PREFERENCES_KEY, 'access_token', token)
      Sketchup.write_default(PREFERENCES_KEY, 'expires_at', expires_at)
      Sketchup.write_default(PREFERENCES_KEY, 'user_email', payload['userEmail'].to_s)
    end

    def clear_session
      Sketchup.write_default(PREFERENCES_KEY, 'access_token', '')
      Sketchup.write_default(PREFERENCES_KEY, 'expires_at', 0)
      Sketchup.write_default(PREFERENCES_KEY, 'user_email', '')
    end

    def ensure_authenticated!
      raise 'Conecte sua conta SpaceNode primeiro.' unless authenticated?
    end

    def authenticated?
      token = access_token
      return false if token.empty?

      expires_at = Sketchup.read_default(PREFERENCES_KEY, 'expires_at', 0).to_i
      expires_at.zero? || expires_at > Time.now.to_i + 30
    end

    def access_token
      Sketchup.read_default(PREFERENCES_KEY, 'access_token', '').to_s
    end

    def api_base_url
      normalize_api_base_url(
        Sketchup.read_default(PREFERENCES_KEY, 'api_base_url', DEFAULT_API_BASE_URL).to_s
      )
    rescue StandardError
      DEFAULT_API_BASE_URL
    end

    def normalize_api_base_url(value)
      raw = value.to_s.strip
      raw = DEFAULT_API_BASE_URL if raw.empty?
      uri = URI.parse(raw)
      raise 'API_BASE_URL deve começar com http:// ou https://.' unless %w[http https].include?(uri.scheme)
      raise 'API_BASE_URL inválida.' if uri.host.to_s.empty?

      port = uri.port
      default_port = (uri.scheme == 'https' && port == 443) || (uri.scheme == 'http' && port == 80)
      "#{uri.scheme}://#{uri.host}#{default_port ? '' : ":#{port}"}"
    end

    def parse_json(raw)
      JSON.parse(raw.to_s)
    rescue JSON::ParserError
      {}
    end

    def send_state
      emit('state', {
        :apiBaseUrl => api_base_url,
        :authenticated => authenticated?,
        :userEmail => Sketchup.read_default(PREFERENCES_KEY, 'user_email', '').to_s,
        :expiresAt => Sketchup.read_default(PREFERENCES_KEY, 'expires_at', 0).to_i,
        :version => VERSION,
        :lastResult => @last_result
      })
    end

    def emit(event, payload = {})
      return unless @dialog

      script = "window.SpaceNodeBridge && window.SpaceNodeBridge.receive(#{JSON.generate(event)}, #{JSON.generate(payload)});"
      UI.start_timer(0, false) do
        begin
          @dialog.execute_script(script) if @dialog && (!@dialog.respond_to?(:visible?) || @dialog.visible?)
        rescue StandardError
          nil
        end
      end
    end

    def emit_error(message, auth_expired = false)
      emit('error', { :message => message.to_s, :authExpired => auth_expired })
    end

    def open_url(url)
      raw = url.to_s.strip
      uri = URI.parse(raw)
      return unless %w[http https].include?(uri.scheme)

      UI.openURL(raw)
    rescue StandardError
      emit_error('URL inválida.')
    end

    unless file_loaded?(__FILE__)
      command = UI::Command.new('SpaceNode') { SpaceNode::SketchUp.activate }
      command.tooltip = 'SpaceNode'
      command.status_bar_text = 'Renderizar viewport atual com a SpaceNode'

      icon_path = File.join(__dir__, 'assets', 'spacenode.svg')
      if File.exist?(icon_path)
        command.small_icon = icon_path
        command.large_icon = icon_path
      end

      UI.menu('Extensions').add_item(command)

      toolbar = UI::Toolbar.new('SpaceNode')
      toolbar.add_item(command)
      toolbar.restore

      file_loaded(__FILE__)
    end
  end
end
