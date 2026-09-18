# frozen_string_literal: true

# Barra flutuante NATIVA da SPACENODE (Windows) — 1.8.0.
#
# Por que existe: a barra de vidro da 1.6.0–1.7.0 era um UI::HtmlDialog, e a
# janela do HtmlDialog é do Qt, que REIMPÕE os próprios flags — não há como
# tirar a moldura nem ligar alfa por pixel nela (medido, ver README). Então a
# barra deixou de ser uma página: é uma janela Win32 PRÓPRIA, criada por
# Fiddle (que vem no Ruby do SketchUp, sem DLL), com WS_EX_LAYERED e pintada
# por UpdateLayeredWindow. Isso dá transparência real sobre a viewport, sombra
# suave, sem faixa de título e sem ×. Provado no SketchUp 2026 em 18/09/26.
#
# O que ela desenha vem de um atlas de sprites pré-renderizado
# (assets/glassbar/<escala>.json + .bin.z, gerado por
# scripts/sketchup-glassbar-atlas.mjs). Aqui só se recorta e compõe com
# AlphaBlend — nenhum laço de pixel em Ruby.
#
# Contrato com o main.rb:
#   GlassBar.available?                      Windows + Fiddle::Closure + atlas
#   GlassBar.show(x, y, orientation, dir, locale, on_action:, on_moved:)
#   GlassBar.update(locale:, panel_open:, disabled:, busy:)
#   GlassBar.orientation = 'vertical'
#   GlassBar.hide / visible? / front / position / shutdown
#
# Regras de sobrevivência (cada uma custou ou custaria um crash):
#   - NENHUMA exceção escapa do WndProc: ela atravessaria frames C do Windows
#     e derrubaria o SketchUp. Tudo lá dentro é rescue Exception.
#   - O closure do WndProc e as strings UTF-16 da classe/título ficam em ivars
#     do módulo: se o GC os recolher, a janela chama memória liberada.
#   - Qualquer falha na criação marca @broken e o main.rb cai no HtmlDialog.
#   - Blur por trás (SetWindowCompositionAttribute) NÃO entra: só cobre o
#     retângulo da janela e é API não documentada. Decisão do dono: sem blur.

require 'fiddle'
require 'json'
require 'zlib'

module SpaceNode
  module SketchUp
    module GlassBar
      module_function

      P  = Fiddle::TYPE_VOIDP
      I  = Fiddle::TYPE_INT
      LL = Fiddle::TYPE_LONG_LONG

      CLASS_NAME = 'SpaceNodeGlassBar'
      SCALES = [1, 1.25, 1.5, 2].freeze
      ORDER = %w[panel capture generate scene edit].freeze
      DISABLED_ALPHA = 82 # ≈ 0,32 — mesmo peso do CSS da 1.7.0
      SPIN_INTERVAL = 0.09
      PANEL_CLICK_DELAY = 0.22 # dois cliques giram a barra; o clique simples espera

      WM_DESTROY        = 0x0002
      WM_MOUSEACTIVATE  = 0x0021
      WM_NCHITTEST      = 0x0084
      WM_NCLBUTTONDBLCLK = 0x00A3
      WM_MOUSEMOVE      = 0x0200
      WM_LBUTTONDOWN    = 0x0201
      WM_LBUTTONUP      = 0x0202
      WM_LBUTTONDBLCLK  = 0x0203
      WM_EXITSIZEMOVE   = 0x0232
      WM_MOUSELEAVE     = 0x02A3
      WM_DPICHANGED     = 0x02E0
      HTTRANSPARENT = -1
      HTCLIENT = 1
      HTCAPTION = 2
      MA_NOACTIVATE = 3

      # ── Lógica pura (testável fora do SketchUp) ──────────────────────────

      # Menor escala do atlas que cobre o DPI; acima de 2x fica no 2x.
      def pick_scale(dpi)
        ratio = dpi.to_f / 96.0
        SCALES.find { |s| s >= ratio - 0.01 } || SCALES.last
      end

      def scale_name(scale)
        scale == scale.to_i ? scale.to_i.to_s : scale.to_s
      end

      def inside?(rect, x, y)
        x >= rect['x'] && y >= rect['y'] && x < rect['x'] + rect['w'] && y < rect['y'] + rect['h']
      end

      # Devolve o id do botão, :plate (área arrastável), :tip ou nil.
      def hit_test(layout, x, y, tip_rect = nil)
        return :tip if tip_rect && inside?(tip_rect, x, y)

        layout['cells'].each { |id, rect| return id if inside?(rect, x, y) }
        inside?(layout['plate'], x, y) ? :plate : nil
      end

      # Qual dica um botão mostra, dado o estado (espelha o toolbar.html).
      def tip_key_for(cell, state)
        return 'busy' if state[:busy] && state[:busy] == cell

        disabled = state[:disabled] || []
        case cell
        when 'generate' then disabled.include?('generate') ? 'offline' : 'generate'
        when 'edit' then disabled.include?('edit') ? 'needRender' : 'edit'
        else cell
        end
      end

      def cell_disabled?(cell, state)
        return false if cell == 'panel'

        disabled = state[:disabled] || []
        disabled.include?(cell) || (state[:busy] && state[:busy] != cell) ? true : false
      end

      # Canto do sprite da dica pra ponta da seta cair no botão.
      def tip_origin(layout, sprite, cell_rect)
        plate = layout['plate']
        caret = sprite['caret']
        if layout['tip']['side'] == 'right'
          [plate['x'] + plate['w'] + layout['tip']['gap'] - caret['x'],
           cell_rect['y'] + cell_rect['h'] / 2 - caret['y']]
        else
          [cell_rect['x'] + cell_rect['w'] / 2 - caret['x'],
           plate['y'] + plate['h'] + layout['tip']['gap'] - caret['y']]
        end
      end

      # ── Disponibilidade ─────────────────────────────────────────────────

      def available?
        return false if @broken
        return false unless ::Sketchup.respond_to?(:platform) && ::Sketchup.platform == :platform_win
        return false unless defined?(Fiddle::Closure::BlockCaller)

        true
      rescue StandardError
        false
      end

      def visible?
        !!(@hwnd && !@hwnd.null? && setup! && @f[:is_window].call(@hwnd) != 0)
      rescue StandardError
        false
      end

      def errors
        @errors ||= []
      end

      def log_error(where, err)
        errors << "#{where}: #{err.class}: #{err.message}"
        errors.shift while errors.length > 20
      end

      # ── Win32 ───────────────────────────────────────────────────────────

      def null
        Fiddle::Pointer.new(0)
      end

      def wide(text)
        (text + "\0").encode('UTF-16LE').force_encoding('BINARY')
      end

      def signed32(value)
        [value & 0xFFFFFFFF].pack('L').unpack1('l')
      end

      def fn(lib, name, args, ret)
        Fiddle::Function.new(lib[name], args, ret)
      end

      def setup!
        return true if @ready
        return false if @broken

        user32 = Fiddle.dlopen('user32.dll')
        kernel32 = Fiddle.dlopen('kernel32.dll')
        gdi32 = Fiddle.dlopen('gdi32.dll')
        msimg32 = Fiddle.dlopen('msimg32.dll')
        @f = {
          :def_proc    => fn(user32, 'DefWindowProcW', [P, I, LL, LL], LL),
          :reg_class   => fn(user32, 'RegisterClassExW', [P], I),
          :create      => fn(user32, 'CreateWindowExW', [I, P, P, I, I, I, I, I, P, P, P, P], P),
          :destroy     => fn(user32, 'DestroyWindow', [P], I),
          :show        => fn(user32, 'ShowWindow', [P, I], I),
          :ulw         => fn(user32, 'UpdateLayeredWindow', [P, P, P, P, P, P, I, P, I], I),
          :set_pos     => fn(user32, 'SetWindowPos', [P, P, I, I, I, I, I], I),
          :rect        => fn(user32, 'GetWindowRect', [P, P], I),
          :active      => fn(user32, 'GetActiveWindow', [], P),
          :foreground  => fn(user32, 'GetForegroundWindow', [], P),
          :ancestor    => fn(user32, 'GetAncestor', [P, I], P),
          :find        => fn(user32, 'FindWindowExW', [P, P, P, P], P),
          :classname   => fn(user32, 'GetClassNameW', [P, P, I], I),
          :text        => fn(user32, 'GetWindowTextW', [P, P, I], I),
          :thread_pid  => fn(user32, 'GetWindowThreadProcessId', [P, P], I),
          :cursor      => fn(user32, 'LoadCursorW', [P, P], P),
          :track       => fn(user32, 'TrackMouseEvent', [P], I),
          :is_window   => fn(user32, 'IsWindow', [P], I),
          :pid         => fn(kernel32, 'GetCurrentProcessId', [], I),
          :module      => fn(kernel32, 'GetModuleHandleW', [P], P),
          :last_error  => fn(kernel32, 'GetLastError', [], I),
          :cdc         => fn(gdi32, 'CreateCompatibleDC', [P], P),
          :dib         => fn(gdi32, 'CreateDIBSection', [P, P, I, P, P, I], P),
          :select      => fn(gdi32, 'SelectObject', [P, P], P),
          :delete_obj  => fn(gdi32, 'DeleteObject', [P], I),
          :delete_dc   => fn(gdi32, 'DeleteDC', [P], I),
          :alpha_blend => fn(msimg32, 'AlphaBlend', [P, I, I, I, I, P, I, I, I, I, I], I)
        }
        # GetDpiForWindow só existe do Windows 10 1607 em diante.
        @f[:dpi] = begin
          fn(user32, 'GetDpiForWindow', [P], I)
        rescue StandardError
          nil
        end

        @proc ||= Fiddle::Closure::BlockCaller.new(LL, [P, I, LL, LL]) do |hwnd, msg, wparam, lparam|
          wnd_proc(hwnd, msg, wparam, lparam)
        end
        @class_name_w = wide(CLASS_NAME)
        @title_w = wide('SPACENODE')
        hinst = @f[:module].call(null)
        cursor = @f[:cursor].call(null, Fiddle::Pointer.new(32_512)) # IDC_ARROW
        # WNDCLASSEXW, 80 bytes em x64. CS_DBLCLKS pro duplo clique da marca.
        @wc = [80, 0x0008].pack('LL') + [@proc.to_i].pack('Q') + [0, 0].pack('ll') +
              [hinst.to_i, 0, cursor.to_i, 0, 0, Fiddle::Pointer[@class_name_w].to_i, 0].pack('Q7')
        atom = @f[:reg_class].call(Fiddle::Pointer[@wc])
        # 1410 = classe já registrada (recarga do plugin na mesma sessão).
        if atom == 0 && @f[:last_error].call != 1410
          raise "RegisterClassExW falhou (#{@f[:last_error].call})"
        end

        @ready = true
      rescue StandardError, LoadError => e
        @broken = true
        log_error('setup', e)
        false
      end

      def window_rect(hwnd = @hwnd)
        buf = "\0" * 16
        @f[:rect].call(hwnd, Fiddle::Pointer[buf])
        buf.unpack('l4')
      end

      # A janela raiz do SketchUp, pra barra ser "dona" dela: acompanha
      # minimizar e fica acima sem TOPMOST. A ativa costuma ser a principal
      # (o clique no N vem dela); se não for, procura pelo processo.
      def owner_window
        active = @f[:active].call
        active = @f[:foreground].call if active.null?
        unless active.null?
          root = @f[:ancestor].call(active, 3)
          return root unless root.null? || !same_process?(root)
        end
        mine = @f[:pid].call
        previous = null
        512.times do
          handle = @f[:find].call(null, previous, null, null)
          break if handle.null?

          previous = handle
          next unless same_process?(handle, mine)

          buffer = "\0" * 512
          length = @f[:text].call(handle, Fiddle::Pointer[buffer], 255)
          title = buffer[0, length * 2].force_encoding('UTF-16LE').encode('UTF-8') rescue ''
          return handle if title.include?('SketchUp')
        end
        null
      end

      def same_process?(handle, mine = @f[:pid].call)
        out = "\0" * 4
        @f[:thread_pid].call(handle, Fiddle::Pointer[out])
        out.unpack1('L') == mine
      end

      def dpi_for(hwnd)
        return 96 unless @f[:dpi]

        value = @f[:dpi].call(hwnd)
        value > 0 ? value : 96
      rescue StandardError
        96
      end

      # ── Atlas e superfícies ──────────────────────────────────────────────

      def load_atlas(scale)
        return if @atlas && @atlas['scale'] == scale

        free_atlas
        base = File.join(@assets_dir, scale_name(scale))
        @atlas = JSON.parse(File.read(base + '.json'))
        pixels = Zlib.inflate(File.binread(base + '.bin.z'))
        w = @atlas['atlas']['w']
        h = @atlas['atlas']['h']
        raise 'atlas com tamanho errado' unless pixels.bytesize == w * h * 4

        @atlas_dc, @atlas_bmp, @atlas_old, bits = make_surface(w, h)
        bits[0, pixels.bytesize] = pixels
        @scale = scale
      end

      def free_atlas
        if @atlas_dc
          @f[:select].call(@atlas_dc, @atlas_old) if @atlas_old
          @f[:delete_dc].call(@atlas_dc)
        end
        @f[:delete_obj].call(@atlas_bmp) if @atlas_bmp
        @atlas_dc = @atlas_bmp = @atlas_old = nil
        @atlas = nil
      end

      # DIB 32 bpp de cima pra baixo, selecionada num DC de memória.
      def make_surface(w, h)
        bmi = [40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0].pack('LllSSLLllLL')
        bits_pp = Fiddle::Pointer.malloc(8, Fiddle::RUBY_FREE)
        bmp = @f[:dib].call(null, Fiddle::Pointer[bmi], 0, bits_pp, null, 0)
        raise 'CreateDIBSection falhou' if bmp.null?

        dc = @f[:cdc].call(null)
        old = @f[:select].call(dc, bmp)
        [dc, bmp, old, bits_pp.ptr]
      end

      def ensure_canvas
        lay = layout
        w = lay['window']['w']
        h = lay['window']['h']
        return if @canvas_dc && @canvas_size == [w, h]

        free_canvas
        @canvas_dc, @canvas_bmp, @canvas_old, @canvas_bits = make_surface(w, h)
        @canvas_size = [w, h]
        @canvas_zero = "\0" * (w * h * 4)
      end

      def free_canvas
        if @canvas_dc
          @f[:select].call(@canvas_dc, @canvas_old) if @canvas_old
          @f[:delete_dc].call(@canvas_dc)
        end
        @f[:delete_obj].call(@canvas_bmp) if @canvas_bmp
        @canvas_dc = @canvas_bmp = @canvas_old = @canvas_bits = nil
        @canvas_size = nil
      end

      def layout
        @atlas['layout'][@orientation]
      end

      def sprite(name)
        @atlas['sprites'][name]
      end

      # Composição src-over pré-multiplicada, no hardware do GDI.
      def blit(name, x, y, alpha = 255)
        s = sprite(name)
        return unless s

        blend = [0, 0, alpha, 1].pack('C4').unpack1('L') # AC_SRC_OVER, AC_SRC_ALPHA
        @f[:alpha_blend].call(@canvas_dc, x, y, s['w'], s['h'], @atlas_dc, s['x'], s['y'], s['w'], s['h'], blend)
      end

      def repaint
        return unless @hwnd && @canvas_dc

        lay = layout
        @canvas_bits[0, @canvas_zero.bytesize] = @canvas_zero
        plate = lay['plate']
        blit(@orientation == 'vertical' ? 'plate_v' : 'plate_h',
             plate['x'] + lay['plateSprite']['dx'], plate['y'] + lay['plateSprite']['dy'])

        ORDER.each do |id|
          cell = lay['cells'][id]
          off = cell_disabled?(id, @state)
          chip = if id == 'panel' && @state[:panel_open] then 'chip_on'
                 elsif @pressed == id && !off then 'chip_press'
                 elsif @hover == id && !off then 'chip_hover'
                 end
          blit(chip, cell['x'], cell['y']) if chip
          if @state[:busy] == id
            spin = sprite("spin_#{@spin_frame || 0}")
            blit("spin_#{@spin_frame || 0}", cell['x'] + (cell['w'] - spin['w']) / 2, cell['y'] + (cell['h'] - spin['h']) / 2)
          else
            icon = sprite("icon_#{id}")
            blit("icon_#{id}", cell['x'] + (cell['w'] - icon['w']) / 2, cell['y'] + (cell['h'] - icon['h']) / 2,
                 off ? DISABLED_ALPHA : 255)
          end
        end

        @tip_rect = nil
        if @hover && (key = tip_key_for(@hover, @state))
          name = "tip_#{@orientation == 'vertical' ? 'v' : 'h'}_#{tip_locale}_#{key}"
          if (s = sprite(name))
            x, y = tip_origin(lay, s, lay['cells'][@hover])
            x = [[x, 0].max, lay['window']['w'] - s['w']].min
            y = [[y, 0].max, lay['window']['h'] - s['h']].min
            blit(name, x, y)
            @tip_rect = { 'x' => x, 'y' => y, 'w' => s['w'], 'h' => s['h'] }
          end
        end

        size = [lay['window']['w'], lay['window']['h']].pack('ll')
        src = [0, 0].pack('ll')
        blend = [0, 0, 255, 1].pack('C4')
        @f[:ulw].call(@hwnd, null, null, Fiddle::Pointer[size], @canvas_dc,
                      Fiddle::Pointer[src], 0, Fiddle::Pointer[blend], 2) # ULW_ALPHA
      end

      def tip_locale
        @atlas['labels'].key?(@state[:locale].to_s) ? @state[:locale].to_s : 'pt'
      end

      # ── Ciclo de vida ───────────────────────────────────────────────────

      # x, y = canto superior esquerdo da PLACA, em px de tela.
      def show(x, y, orientation, assets_dir, locale, on_action:, on_moved:)
        return false unless available? && setup!

        @assets_dir = assets_dir
        @orientation = orientation == 'vertical' ? 'vertical' : 'horizontal'
        @state ||= { :locale => 'pt', :panel_open => false, :disabled => [], :busy => nil }
        @state[:locale] = locale.to_s
        @on_action = on_action
        @on_moved = on_moved
        @hover = @pressed = nil

        if visible?
          front
          repaint
          return true
        end

        ex = 0x00080000 | 0x00000080 | 0x08000000 # LAYERED | TOOLWINDOW | NOACTIVATE
        style = signed32(0x80000000)              # WS_POPUP
        owner = owner_window
        @hwnd = @f[:create].call(ex, Fiddle::Pointer[@class_name_w], Fiddle::Pointer[@title_w], style,
                                 x, y, 10, 10, owner, null, @f[:module].call(null), null)
        raise "CreateWindowExW falhou (#{@f[:last_error].call})" if @hwnd.null?

        load_atlas(pick_scale(dpi_for(@hwnd)))
        ensure_canvas
        place_plate(x, y)
        repaint
        @f[:show].call(@hwnd, 4) # SW_SHOWNOACTIVATE
        true
      rescue StandardError => e
        log_error('show', e)
        hide
        @broken = true
        false
      end

      # Move a janela pra placa ficar em (x, y) de tela.
      def place_plate(x, y)
        plate = layout['plate']
        @f[:set_pos].call(@hwnd, null, x - plate['x'], y - plate['y'], 0, 0, 0x0015) # NOSIZE|NOZORDER|NOACTIVATE
      end

      # Primeira vez, sem posição guardada: centrada sobre a janela do
      # SketchUp, um pouco abaixo das toolbars nativas.
      def suggested_spot(plate_w, plate_h)
        return [200, 160] unless setup!

        owner = owner_window
        return [200, 160] if owner.null?

        left, top, right, = window_rect(owner)
        [left + ((right - left) - plate_w) / 2, top + 150 + (plate_h > plate_w ? 0 : 0)]
      rescue StandardError
        [200, 160]
      end

      def position
        return nil unless visible?

        left, top, = window_rect
        plate = layout['plate']
        [left + plate['x'], top + plate['y']]
      rescue StandardError
        nil
      end

      def front
        return unless visible?

        @f[:set_pos].call(@hwnd, null, 0, 0, 0, 0, 0x0013) # HWND_TOP, NOSIZE|NOMOVE|NOACTIVATE
      end

      def hide
        stop_spinner
        cancel_panel_click
        if @hwnd && !@hwnd.null? && @ready && @f[:is_window].call(@hwnd) != 0
          @f[:destroy].call(@hwnd)
        end
      rescue StandardError => e
        log_error('hide', e)
      ensure
        @hwnd = nil
        @hover = @pressed = nil
        @tip_rect = nil
        free_canvas if @ready
      end

      # No encerramento o Ruby vai embora antes das janelas: destrói antes que
      # o Windows mande WM_DESTROY pra um closure que já não existe.
      def shutdown
        hide
        free_atlas if @ready
      rescue StandardError
        nil
      end

      def orientation=(value)
        value = value == 'vertical' ? 'vertical' : 'horizontal'
        return if value == @orientation

        pos = position
        @orientation = value
        return unless visible?

        ensure_canvas
        place_plate(pos[0], pos[1]) if pos
        @hover = @pressed = nil
        repaint
      end

      def update(state)
        @state ||= { :locale => 'pt', :panel_open => false, :disabled => [], :busy => nil }
        @state[:locale] = state[:locale].to_s if state.key?(:locale)
        @state[:panel_open] = !!state[:panel_open] if state.key?(:panel_open)
        @state[:disabled] = Array(state[:disabled]).map(&:to_s) if state.key?(:disabled)
        @state[:busy] = state[:busy] && state[:busy].to_s if state.key?(:busy)
        return unless visible?

        @state[:busy] ? start_spinner : stop_spinner
        repaint
      end

      def start_spinner
        return if @spin_timer

        @spin_frame = 0
        @spin_timer = ::UI.start_timer(SPIN_INTERVAL, true) do
          begin
            @spin_frame = ((@spin_frame || 0) + 1) % 8
            repaint
          rescue StandardError => e
            log_error('spinner', e)
          end
        end
      end

      def stop_spinner
        ::UI.stop_timer(@spin_timer) if @spin_timer
        @spin_timer = nil
      end

      def cancel_panel_click
        ::UI.stop_timer(@panel_timer) if @panel_timer
        @panel_timer = nil
      end

      def fire(action)
        cb = @on_action
        cb.call(action) if cb
      rescue StandardError => e
        log_error("action #{action}", e)
      end

      # ── Mensagens ───────────────────────────────────────────────────────

      def wnd_proc(hwnd, msg, wparam, lparam)
        handled = nil
        begin
          handled = handle_message(msg, wparam, lparam)
        rescue Exception => e # rubocop:disable Lint/RescueException
          log_error("msg #{msg}", e)
        end
        handled.nil? ? @f[:def_proc].call(hwnd, msg, wparam, lparam) : handled
      end

      def point_from(lparam)
        x = lparam & 0xFFFF
        y = (lparam >> 16) & 0xFFFF
        x -= 0x10000 if x >= 0x8000
        y -= 0x10000 if y >= 0x8000
        [x, y]
      end

      def handle_message(msg, wparam, lparam)
        case msg
        when WM_MOUSEACTIVATE then MA_NOACTIVATE
        when WM_NCHITTEST
          return nil unless @atlas

          sx, sy = point_from(lparam)
          left, top, = window_rect
          case hit_test(layout, sx - left, sy - top, @tip_rect)
          when :tip, nil then HTTRANSPARENT
          when :plate then HTCAPTION
          else HTCLIENT
          end
        when WM_NCLBUTTONDBLCLK then 0 # duplo clique na placa NÃO maximiza
        when WM_MOUSEMOVE
          x, y = point_from(lparam)
          cell = hit_test(layout, x, y)
          cell = nil unless cell.is_a?(String)
          if cell != @hover
            front if @hover.nil?
            @hover = cell
            track_leave
            repaint
          end
          0
        when WM_MOUSELEAVE
          @hover = @pressed = nil
          repaint
          0
        when WM_LBUTTONDOWN
          x, y = point_from(lparam)
          cell = hit_test(layout, x, y)
          @pressed = cell.is_a?(String) && !cell_disabled?(cell, @state) ? cell : nil
          repaint
          0
        when WM_LBUTTONUP
          x, y = point_from(lparam)
          cell = hit_test(layout, x, y)
          pressed = @pressed
          @pressed = nil
          repaint
          click(pressed) if pressed && cell == pressed
          0
        when WM_LBUTTONDBLCLK
          x, y = point_from(lparam)
          if hit_test(layout, x, y) == 'panel'
            cancel_panel_click
            fire(:orientation)
          end
          0
        when WM_EXITSIZEMOVE
          pos = position
          @on_moved.call(pos[0], pos[1]) if pos && @on_moved
          0
        when WM_DPICHANGED
          dpi = (wparam >> 16) & 0xFFFF
          rescale(pick_scale(dpi))
          0
        when WM_DESTROY
          stop_spinner
          @hwnd = nil
          nil
        end
      end

      def click(cell)
        @hover = nil
        repaint
        if cell == 'panel'
          cancel_panel_click
          @panel_timer = ::UI.start_timer(PANEL_CLICK_DELAY, false) do
            @panel_timer = nil
            fire(:panel)
          end
        else
          fire(cell.to_sym)
        end
      end

      def track_leave
        tme = [24, 2, @hwnd.to_i, 0].pack('LLQL') + ("\0" * 4) # TME_LEAVE
        @f[:track].call(Fiddle::Pointer[tme])
      end

      def rescale(scale)
        return if scale == @scale

        pos = position
        load_atlas(scale)
        ensure_canvas
        place_plate(pos[0], pos[1]) if pos
        repaint
      end
    end
  end
end
