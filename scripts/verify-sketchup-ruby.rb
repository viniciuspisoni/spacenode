# frozen_string_literal: true

# Verificação offline do núcleo Ruby do plugin (sketchup/spacenode/main.rb)
# FORA do SketchUp: a API do SketchUp é substituída por dublês mínimos e o
# arquivo real é carregado. Cobre o que a 1.4.0 introduziu e que só rodaria
# dentro do SketchUp:
#
#   - diff_mask_files: dois passes → máscara branca/preta, cobertura, padding
#   - capture_frame: o quadro da máscara é o mesmo da captura
#   - diário do .skp: adicionar, deduplicar por clientRequestId, teto, apagar
#   - revision_seed_from / url_path_only
#   - reconcile_lost_edit: acha a edição paga em /api/edits (nada em dobro) e
#     desiste com registro "não confirmada" quando não acha
#   - catálogo com sessão vencida: renova antes do GET, 401 renova e tenta
#     UMA vez, na segunda avisa com authExpired
#   - on_panel_ready: catálogo em cache sai sem rede; sessão passa pela
#     renovação
#
# Rodar: C:/Ruby32-x64/bin/ruby scripts/verify-sketchup-ruby.rb
# Não faz nenhuma chamada HTTP: Sketchup::Http::Request nunca é iniciado.

require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'time'
require 'fileutils'

# ── Dublês da API do SketchUp ────────────────────────────────────────────────

$spn_images = {}
$spn_timers = []

module Sketchup
  PREFS = {}
  def self.read_default(section, key, default = nil)
    PREFS.fetch([section, key], default)
  end

  def self.write_default(section, key, value)
    PREFS[[section, key]] = value
    true
  end

  def self.version
    '26.0.0'
  end

  def self.get_locale
    'pt-BR'
  end

  def self.active_model
    $spn_model
  end

  def self.register_extension(*); end
  def self.status_text=(*); end

  class ViewObserver; end
  class AppObserver; end
  class ModelObserver; end
  class Entity; end
  class Face < Entity; end
  class Group < Entity; end
  class ComponentInstance < Entity; end
  class Material; end

  class Color
    attr_reader :red, :green, :blue, :alpha

    def initialize(r, g, b, a = 255)
      @red = r
      @green = g
      @blue = b
      @alpha = a
    end
  end

  module Http
    GET = 0
    POST = 1
    PUT = 2

    class Request
      attr_accessor :headers, :body

      def initialize(_url, _method); end
      def start; end
      def cancel; end
    end
  end

  # ImageRep em memória: load_file/save_file usam um registro path → buffer.
  class ImageRep
    attr_reader :width, :height, :bits_per_pixel, :row_padding, :data

    def load_file(path)
      img = $spn_images.fetch(path)
      @width = img[:w]
      @height = img[:h]
      @bits_per_pixel = img[:bpp]
      @row_padding = img[:pad]
      @data = img[:data]
    end

    def set_data(w, h, bpp, pad, data)
      @width = w
      @height = h
      @bits_per_pixel = bpp
      @row_padding = pad
      @data = data
    end

    def save_file(path)
      $spn_images[path] = { :w => @width, :h => @height, :bpp => @bits_per_pixel, :pad => @row_padding, :data => @data }
      File.binwrite(path, 'stub')
      true
    end
  end
end

module Geom
  class Point3d
    attr_reader :x, :y, :z

    def initialize(x = 0, y = 0, z = 0)
      @x = x
      @y = y
      @z = z
    end

    def to_a
      [x, y, z]
    end
  end

  class Vector3d < Point3d; end
  class Transformation; end
end

module UI
  def self.start_timer(seconds, _repeat = false, &block)
    $spn_timers << [seconds, block]
    $spn_timers.length
  end

  def self.openURL(*); end
  def self.messagebox(*); end
  def self.menu(*); end

  class HtmlDialog; end
  class Command; end
  class Toolbar; end
  class Notification; end
end

def file_loaded?(_file)
  true
end

def file_loaded(_file); end

MF_GRAYED = 0
MF_ENABLED = 1
TB_NEVER_SHOWN = -1

# ── Carrega o main.rb real ──────────────────────────────────────────────────

STUB_DIR = Dir.mktmpdir('spn-stubs')
File.write(File.join(STUB_DIR, 'sketchup.rb'), '')
File.write(File.join(STUB_DIR, 'extensions.rb'), '')
$LOAD_PATH.unshift(STUB_DIR)
require File.expand_path('../sketchup/spacenode/main.rb', __dir__)

PLUGIN = SpaceNode::SketchUp
PREF = SpaceNode::SketchUp::PREFERENCES_KEY

class FakeView
  attr_accessor :camera

  def initialize(w = 1000, h = 500)
    @w = w
    @h = h
    @camera = FakeCamera.new
  end

  def vpwidth
    @w
  end

  def vpheight
    @h
  end
end

class FakeCamera
  attr_accessor :aspect_ratio

  def initialize
    @aspect_ratio = 0.0
  end

  def eye
    Geom::Point3d.new(0, 0, 0)
  end

  def target
    Geom::Point3d.new(1, 0, 0)
  end
end

# RenderingOptions de mentira: chave ausente lê nil (como no SketchUp antigo)
# e grava o que foi escrito, pra provar que a preparação some no restauro.
class FakeRenderingOptions
  attr_reader :written

  def initialize(values)
    @values = values.dup
    @written = []
  end

  def [](key)
    @values[key]
  end

  def []=(key, value)
    raise "chave inexistente: #{key}" unless @values.key?(key)

    @written << key
    @values[key] = value
  end

  def snapshot
    @values.dup
  end
end

class FakeModel
  attr_reader :ops

  def initialize
    @attrs = {}
    @ops = []
    @view = FakeView.new
  end

  def get_attribute(dict, key, default = nil)
    @attrs.fetch([dict, key], default)
  end

  def set_attribute(dict, key, value)
    @attrs[[dict, key]] = value
  end

  def start_operation(*)
    @ops << :start
    true
  end

  def commit_operation
    @ops << :commit
    true
  end

  def abort_operation
    @ops << :abort
    true
  end

  def entities
    []
  end

  def definitions
    []
  end

  def bounds
    Struct.new(:diagonal).new(100.0)
  end

  def pages
    Struct.new(:selected_page).new(nil)
  end

  def active_view
    @view
  end
end

# Imagem sintética: bloco de linhas com padding, pixel = [r, g, b(, a)].
def make_image(path, w, h, bpp, pad)
  bytes = bpp / 8
  rows = (0...h).map do |y|
    row = (0...w).map do |x|
      px = yield(x, y)
      px = px + [255] if bytes == 4
      px.pack('C*')
    end.join
    row + ("\x00" * pad)
  end
  $spn_images[path] = { :w => w, :h => h, :bpp => bpp, :pad => pad, :data => rows.join.b }
end

def pixel_of(path, x, y)
  img = $spn_images.fetch(path)
  bytes = img[:bpp] / 8
  stride = img[:w] * bytes + img[:pad]
  img[:data].byteslice(y * stride + x * bytes, 3).unpack('C*')
end

def run_timers!(limit = 50)
  count = 0
  until $spn_timers.empty? || count >= limit
    _sec, block = $spn_timers.shift
    block.call
    count += 1
  end
end

# Cada teste começa com prefs, modelo, timers, eventos e estado interno zerados.
class SpaceNodeRubyTest < Minitest::Test
  def setup
    Sketchup::PREFS.clear
    $spn_images.clear
    $spn_timers.clear
    $spn_model = FakeModel.new
    @events = []
    @calls = []
    events = @events
    PLUGIN.define_singleton_method(:emit) { |event, payload = {}| events << [event, JSON.parse(JSON.generate(payload))] }
    PLUGIN.define_singleton_method(:emit_camera_facts) {}
    PLUGIN.define_singleton_method(:attach_photo_observers) {}
    PLUGIN.define_singleton_method(:emit_mirrors) {}
    PLUGIN.define_singleton_method(:list_scenes) {}
    PLUGIN.instance_variable_set(:@generating, false)
    PLUGIN.instance_variable_set(:@generation_context, nil)
    PLUGIN.instance_variable_set(:@last_result, nil)
    PLUGIN.instance_variable_set(:@catalog, nil)
    PLUGIN.instance_variable_set(:@renewing, false)
    PLUGIN.instance_variable_set(:@refresh_waiters, [])
    PLUGIN.instance_variable_set(:@update_notified, false)
    PLUGIN.instance_variable_set(:@balance, nil)
  end

  def events(name)
    @events.select { |e, _| e == name }.map { |_, p| p }
  end

  # Roteia json_request por caminho: cada entrada é um Array de respostas
  # consumidas em ordem ({:ok => data} ou {:error => [message, status]}).
  def script_http(script)
    calls = @calls
    PLUGIN.define_singleton_method(:json_request) do |_method, path, body, on_error, _opts = {}, &on_success|
      calls << [path, body]
      queue = script[path] or raise "sem roteiro para #{path}"
      step = queue.length > 1 ? queue.shift : queue.first
      if step[:error]
        message, status = step[:error]
        handle_auth_failure if status == 401
        on_error.call(SpaceNode::SketchUp::ApiError.new(message, status))
      else
        on_success.call(step[:ok])
      end
      nil
    end
  end

  def pair_device!(expired: true)
    Sketchup.write_default(PREF, 'device_id', 'dev-1')
    Sketchup.write_default(PREF, 'device_secret', 'sec-1')
    Sketchup.write_default(PREF, 'access_token', 'tok-old')
    Sketchup.write_default(PREF, 'expires_at', expired ? Time.now.to_i - 10 : Time.now.to_i + 7200)
  end

  # ── Máscara da seleção ────────────────────────────────────────────────────

  def test_diff_mask_files_marks_only_where_passes_differ
    make_image('a.png', 64, 32, 24, 2) { |_x, _y| [200, 200, 200] }
    make_image('b.png', 64, 32, 24, 2) do |x, y|
      if x >= 10 && x < 30 && y >= 5 && y < 15
        [0, 255, 255]
      elsif x == 0 && y == 0
        [190, 200, 205] # diferença pequena (antialias) fica abaixo do limiar
      else
        [200, 200, 200]
      end
    end
    out = PLUGIN.diff_mask_files('a.png', 'b.png', File.join(STUB_DIR, 'out.png'))
    refute_nil out
    assert_equal 64, out[:width]
    assert_equal 32, out[:height]
    assert_equal 200, out[:pixels]
    assert_in_delta 200.0 / (64 * 32), out[:coverage], 1e-9
    saved = $spn_images[File.join(STUB_DIR, 'out.png')]
    assert_equal 24, saved[:bpp]
    assert_equal 0, saved[:pad]
    assert_equal [255, 255, 255], pixel_of(File.join(STUB_DIR, 'out.png'), 15, 10)
    assert_equal [0, 0, 0], pixel_of(File.join(STUB_DIR, 'out.png'), 0, 0)
    assert_equal [0, 0, 0], pixel_of(File.join(STUB_DIR, 'out.png'), 63, 31)
  end

  def test_diff_mask_files_handles_32bpp_and_refuses_mismatch
    make_image('a32.png', 16, 8, 32, 0) { |_x, _y| [10, 10, 10] }
    make_image('b32.png', 16, 8, 32, 0) { |x, _y| x < 4 ? [250, 0, 250] : [10, 10, 10] }
    out = PLUGIN.diff_mask_files('a32.png', 'b32.png', File.join(STUB_DIR, 'out32.png'))
    assert_equal 4 * 8, out[:pixels]
    make_image('c.png', 20, 8, 24, 0) { |_x, _y| [0, 0, 0] }
    assert_nil PLUGIN.diff_mask_files('a32.png', 'c.png', File.join(STUB_DIR, 'nope.png')), 'tamanhos diferentes não geram máscara'
  end

  def test_capture_frame_matches_capture_math
    view = FakeView.new(1000, 500)
    free = PLUGIN.capture_frame(view, view.camera, { :aspect => 0.0, :level => false }, 1280)
    assert_equal [1280, 640], [free[:width], free[:height]], 'Livre = proporção da viewport'
    photo = PLUGIN.capture_frame(view, view.camera, { :aspect => 1.7778, :level => false }, 1280)
    assert_equal [1280, 720], [photo[:width], photo[:height]]
    forced = PLUGIN.capture_frame(view, view.camera, { :aspect => 1.7778, :level => false }, 1280, 0.8)
    assert_equal [1024, 1280], [forced[:width], forced[:height]], 'frameAspect do render base manda sobre a foto atual'
    assert_in_delta 0.8, forced[:aspect], 1e-9
  end

  # ── Diário do arquivo ─────────────────────────────────────────────────────

  def test_journal_add_dedupes_caps_and_deletes
    PLUGIN.journal_add(:id => 'r1', :kind => 'render', :sceneName => 'Cozinha')
    entries = PLUGIN.journal_entries
    assert_equal 1, entries.length
    assert_equal 'Cozinha', entries[0]['sceneName'], 'chaves em string, como voltam do .skp'
    assert entries[0]['createdAt'], 'createdAt preenchido'
    assert_equal [:start, :commit], $spn_model.ops.last(2)

    PLUGIN.journal_add(:id => 'rev-a', :kind => 'revision', :clientRequestId => 'c1', :status => 'uncertain')
    PLUGIN.journal_add(:id => 'job-9', :kind => 'revision', :clientRequestId => 'c1', :status => 'reconciled')
    ids = PLUGIN.journal_entries.map { |e| e['id'] }
    assert_equal %w[job-9 r1], ids, 'mesmo clientRequestId substitui a entrada (não duplica)'

    45.times { |i| PLUGIN.journal_add(:id => "x#{i}", :kind => 'render') }
    assert_equal SpaceNode::SketchUp::JOURNAL_MAX_ENTRIES, PLUGIN.journal_entries.length

    PLUGIN.handle_journal_delete(JSON.generate('id' => 'x44'))
    refute_includes PLUGIN.journal_entries.map { |e| e['id'] }, 'x44'
    assert_equal 'journal', @events.last[0]
  end

  def test_revision_seed_from_records_origin_and_request
    PLUGIN.instance_variable_set(:@last_result, { :seed => 42, :camera => { 'eye' => [1, 2, 3] }, :sceneName => 'Sala' })
    payload = {
      'action' => 'swap_material', 'instruction' => '  carvalho claro ', 'referenceMaterial' => 'Madeira 01',
      'baseId' => 'render-1', 'baseRenderId' => 'uuid-1', 'maskSource' => 'selection',
      'selection' => { 'count' => 2, 'names' => %w[Marcenaria Bancada], 'pids' => [101, 102], 'coverage' => 0.12 }
    }
    seed = PLUGIN.revision_seed_from(payload, 'https://h/base.png?token=1', 'https://h/mask.png', nil, 'c-1')
    assert_equal 'revision', seed[:kind]
    assert_equal 'carvalho claro', seed[:instruction]
    assert_equal 'render-1', seed[:baseId]
    assert_equal 'uuid-1', seed[:baseRenderId]
    assert_equal 'Sala', seed[:sceneName], 'cena herdada do último resultado quando o painel não manda'
    assert_equal({ 'eye' => [1, 2, 3] }, seed[:camera])
    assert_equal 'selection', seed[:maskSource]
    assert_equal 0.12, seed[:maskCoverage]
    assert_equal({ :count => 2, :names => %w[Marcenaria Bancada], :pids => [101, 102] }, seed[:selection])
    assert_equal false, seed[:referenceSent]
    assert_equal 'none', PLUGIN.revision_seed_from(payload, 'https://h/b.png', nil, nil, 'c-2')[:maskSource]
  end

  def test_url_path_only_ignores_signature_query
    assert_equal 'x.supabase.co/storage/v1/object/sign/a/b.png',
                 PLUGIN.url_path_only('https://x.supabase.co/storage/v1/object/sign/a/b.png?token=abc&x=1')
    assert_equal PLUGIN.url_path_only('https://h/a.png?token=1'), PLUGIN.url_path_only('https://h/a.png?token=2')
  end

  # ── Reconciliação da edição (pagar uma vez) ───────────────────────────────

  def seed_for(url)
    { :kind => 'revision', :clientRequestId => 'c-9', :baseUrl => url, :originalUrl => url, :action => 'swap_material' }
  end

  def start_edit_context!
    PLUGIN.instance_variable_set(:@generating, true)
    PLUGIN.instance_variable_set(:@generation_epoch, 7)
    PLUGIN.instance_variable_set(:@generation_context, { :mode => :edit, :started_at => Time.now - 30, :source => 'https://h/base.png?token=aaa' })
    PLUGIN.instance_variable_set(:@generate_request, nil)
  end

  def test_reconcile_adopts_completed_edit_from_server
    start_edit_context!
    script_http(
      '/api/edits' => [{ :ok => { 'edits' => [
        { 'id' => 'old', 'source_image_url' => 'https://h/base.png?token=zzz', 'result_image_url' => 'https://h/old.png',
          'nodes_cost' => 18, 'created_at' => (Time.now - 3600).iso8601 },
        { 'id' => 'job-9', 'source_image_url' => 'https://h/base.png?token=zzz', 'result_image_url' => 'https://h/res.png',
          'nodes_cost' => 18, 'created_at' => Time.now.iso8601 }
      ] } }],
      '/api/sketchup/session' => [{ :ok => { 'balance' => { 'totalBalance' => 100 } } }]
    )
    PLUGIN.reconcile_lost_edit(7, seed_for('https://h/base.png?token=aaa'))
    result = events('result').last
    refute_nil result, 'a edição paga foi recuperada como resultado'
    assert_equal 'job-9', result['jobId'], 'a edição antiga NÃO é adotada — só a criada depois do início'
    assert_equal 'https://h/res.png', result['outputUrl']
    assert_equal 'reconciled', result['status']
    assert_equal false, PLUGIN.instance_variable_get(:@generating)
    assert_equal 'reconciled', PLUGIN.journal_entries.first['status']
    assert_equal 1, @calls.count { |p, _| p == '/api/edits' }, 'sem retentativa quando achou'
  end

  def test_reconcile_gives_up_with_uncertain_entry
    start_edit_context!
    script_http('/api/edits' => [{ :ok => { 'edits' => [] } }])
    PLUGIN.reconcile_lost_edit(7, seed_for('https://h/base.png?token=aaa'))
    run_timers!
    max_polls = SpaceNode::SketchUp::EDIT_RECONCILE_MAX_SECONDS / SpaceNode::SketchUp::EDIT_RECONCILE_POLL_SECONDS + 1
    assert_equal max_polls, @calls.count { |p, _| p == '/api/edits' }, 'consulta até o teto e para'
    assert_equal false, PLUGIN.instance_variable_get(:@generating)
    assert_equal 'uncertain', PLUGIN.journal_entries.first['status']
    err = events('error').last
    assert err && err['generation'], 'o painel destrava com o erro de geração'
    assert_match(/confirmar a edição/i, err['message'])
    assert_empty events('result'), 'nada é adotado às cegas'
  end

  # ── Catálogo com sessão vencida ───────────────────────────────────────────

  def test_refresh_catalog_renews_then_retries_once_on_401
    pair_device!(expired: true)
    script_http(
      '/api/sketchup/pair/refresh' => [{ :ok => { 'accessToken' => 'tok-new', 'expiresAt' => Time.now.to_i + 3600 } }],
      '/api/sketchup/catalog' => [{ :error => ['Erro HTTP 401', 401] }, { :ok => { 'version' => 9, 'engines' => [] } }]
    )
    PLUGIN.refresh_catalog
    assert_equal ['/api/sketchup/pair/refresh', '/api/sketchup/catalog', '/api/sketchup/pair/refresh', '/api/sketchup/catalog'],
                 @calls.map(&:first)
    assert_equal 1, events('catalog').length, 'catálogo entregue depois da renovação'
    assert_empty events('catalogError')
    assert_equal 'tok-new', Sketchup.read_default(PREF, 'access_token')
  end

  def test_refresh_catalog_second_401_offers_reconnect
    pair_device!(expired: true)
    script_http(
      '/api/sketchup/pair/refresh' => [{ :ok => { 'accessToken' => 'tok-new', 'expiresAt' => Time.now.to_i + 3600 } }],
      '/api/sketchup/catalog' => [{ :error => ['Erro HTTP 401', 401] }]
    )
    PLUGIN.refresh_catalog
    assert_equal 2, @calls.count { |p, _| p == '/api/sketchup/catalog' }, 'uma retentativa, não um laço'
    err = events('catalogError').last
    refute_nil err
    assert_equal true, err['authExpired']
  end

  def test_refresh_catalog_without_device_clears_dead_session
    Sketchup.write_default(PREF, 'access_token', 'tok-legacy')
    Sketchup.write_default(PREF, 'expires_at', Time.now.to_i - 10)
    script_http({})
    PLUGIN.refresh_catalog
    assert_empty @calls, 'sem dispositivo não há como renovar: nenhum GET com token morto'
    assert_equal '', Sketchup.read_default(PREF, 'access_token')
    assert(events('error').any? { |e| e['authExpired'] })
  end

  def test_on_panel_ready_serves_cached_catalog_and_renews_before_session
    pair_device!(expired: true)
    cached = { 'version' => 9, 'engines' => [{ 'id' => 'quasar' }] }
    PLUGIN.write_json_default('catalog_json', JSON.generate(cached))
    Sketchup.write_default(PREF, 'catalog_at', Time.now.to_i)
    script_http(
      '/api/sketchup/pair/refresh' => [{ :ok => { 'accessToken' => 'tok-new', 'expiresAt' => Time.now.to_i + 3600 } }],
      '/api/sketchup/session' => [{ :ok => { 'balance' => { 'totalBalance' => 500 }, 'theme' => 'light' } }]
    )
    PLUGIN.on_panel_ready
    assert_equal 1, events('catalog').length, 'catálogo em cache sai na hora'
    assert_equal 'quasar', events('catalog').first['engines'][0]['id']
    assert_equal ['/api/sketchup/pair/refresh', '/api/sketchup/session'], @calls.map(&:first), 'sem GET do catálogo (cache) e sessão só depois de renovar'
    assert_equal 500, events('session').last['balance']['totalBalance']
    assert(events('state').any? { |s| s.key?('journal') }, 'o estado leva o diário')
  end

  # ── Preparação fotorrealista da captura ──────────────────────────────────

  def test_capture_kills_the_graphic_stroke_and_keeps_the_thin_edge
    opts = SpaceNode::SketchUp::CLEAN_CAPTURE_OPTIONS
    # O perfil é o traço grosso que a IA copiava como contorno desenhado.
    assert_equal false, opts['DrawSilhouettes']
    assert_equal 1, opts['SilhouetteWidth']
    assert_equal false, opts['DrawProfilesOnly']
    # Geometria oculta/de trás vira linha fantasma sobre a face.
    assert_equal false, opts['DrawBackEdges']
    assert_equal false, opts['DrawHidden']
    # Nome da cena escrito sobre a vista é elemento auxiliar, não projeto.
    assert_equal false, opts['ShowViewName']
    # A ARESTA FICA: é ela que desenha caixilho, junta e paginação. Sem
    # EdgeDisplayMode/DisplayEdges na lista, o traço fino sobrevive.
    refute opts.key?('EdgeDisplayMode'), 'desligar a aresta apaga o caixilho'
    refute opts.key?('DisplayEdges'), 'desligar a aresta apaga o caixilho'
    # Medidos e reprovados — ver README (§ preparação fotorrealista).
    refute opts.key?('EdgeColorMode'), 'apaga o caixilho junto com o traço'
    refute opts.key?('AmbientOcclusion'), 'não tem efeito no write_image'
    refute opts.key?('TransparencySort'), 'não tem efeito na imagem'
    # Sombra é intenção de luz do usuário: não se força na captura.
    refute opts.key?('DisplayShadows')
  end

  def test_edge_map_does_not_carry_the_thick_profile
    opts = SpaceNode::SketchUp::EDGE_CAPTURE_OPTIONS
    assert_equal 1, opts['RenderMode'], 'o mapa segue em linha escondida'
    assert_equal false, opts['DrawSilhouettes']
    assert_equal 1, opts['SilhouetteWidth']
  end

  # A preparação vale durante a captura e some depois — inclusive em erro.
  def test_rendering_options_round_trip_restores_every_key
    ro = FakeRenderingOptions.new(
      'DrawSilhouettes' => true, 'SilhouetteWidth' => 3, 'RenderMode' => 2,
      'ShowViewName' => true, 'Texture' => false
    )
    antes = ro.snapshot
    saved = PLUGIN.apply_rendering_options(ro, PLUGIN.photo_capture_options(ro))
    assert_equal false, ro['DrawSilhouettes'], 'a preparação vale durante a captura'
    assert_equal 1, ro['SilhouetteWidth']
    assert_equal 3, ro['RenderMode'], 'sombreado sem textura (2) vira texturizado (3)'
    assert_equal false, ro['ShowViewName']
    PLUGIN.restore_rendering_options(ro, saved)
    assert_equal antes, ro.snapshot, 'estado anterior restaurado chave a chave'
  end

  def test_rendering_options_skip_keys_absent_in_old_sketchup
    # SketchUp antigo não tem DrawSilhouettes/ShowViewName: a leitura dá nil e
    # a chave é PULADA (nunca escrita, nunca restaurada).
    ro = FakeRenderingOptions.new('RenderMode' => 2)
    saved = PLUGIN.apply_rendering_options(ro, PLUGIN.photo_capture_options(ro))
    refute saved.key?('DrawSilhouettes')
    refute ro.written.include?('DrawSilhouettes')
    assert_equal 3, ro['RenderMode'], 'o que existe continua sendo aplicado'
  end

  # Estilo já fotográfico (3) ou fora da lista conhecida não é promovido.
  def test_render_mode_only_promoted_from_known_drawing_modes
    assert_equal 3, PLUGIN.photo_capture_options(FakeRenderingOptions.new('RenderMode' => 0))['RenderMode']
    assert_equal 3, PLUGIN.photo_capture_options(FakeRenderingOptions.new('RenderMode' => 5))['RenderMode']
    refute PLUGIN.photo_capture_options(FakeRenderingOptions.new('RenderMode' => 3)).key?('RenderMode')
    refute PLUGIN.photo_capture_options(FakeRenderingOptions.new('RenderMode' => 7)).key?('RenderMode')
  end

  def test_version_gate_still_numeric
    assert PLUGIN.version_newer?('1.4.0', '1.3.1')
    refute PLUGIN.version_newer?('1.4.0', '1.4.0')
    assert PLUGIN.version_newer?('1.10.0', '1.9.0')
  end
end
