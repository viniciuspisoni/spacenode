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
MF_CHECKED = 2
MF_UNCHECKED = 3
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

  # Paralela por padrão: camera_facts pula o bloco de lente/olho e testa só
  # o que o dublê consegue responder (sombras, estilo).
  def perspective?
    false
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
  # 1.9.0: camera_facts lê sombras e modo de render do modelo (só leitura).
  attr_accessor :shadow_info, :rendering_options

  def initialize
    @attrs = {}
    @ops = []
    @view = FakeView.new
    @shadow_info = { 'DisplayShadows' => true }
    @rendering_options = FakeRenderingOptions.new('RenderMode' => 3)
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
      '/api/sketchup/catalog' => [{ :error => ['Erro HTTP 401', 401] }, { :ok => { 'version' => PLUGIN::CATALOG_MIN_VERSION, 'engines' => [] } }]
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

  # Catálogo em disco anterior ao formato atual (ex.: sem engines[].supports da
  # v10) não pode ser servido: o painel leria campos que não existem.
  def test_cached_catalog_older_than_min_version_is_discarded
    stale = { 'version' => PLUGIN::CATALOG_MIN_VERSION - 1, 'engines' => [{ 'id' => 'quasar' }] }
    PLUGIN.write_json_default('catalog_json', JSON.generate(stale))
    Sketchup.write_default(PREF, 'catalog_at', Time.now.to_i)
    assert_nil PLUGIN.cached_catalog, 'cache abaixo de CATALOG_MIN_VERSION é descartado'
  end

  def test_on_panel_ready_serves_cached_catalog_and_renews_before_session
    pair_device!(expired: true)
    cached = { 'version' => PLUGIN::CATALOG_MIN_VERSION, 'engines' => [{ 'id' => 'quasar' }] }
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

  # ── 1.9.0 ──────────────────────────────────────────────────────────────

  # O painel avisa antes de cobrar: sombras desligadas e estilo de linha
  # entram nos fatos da câmera, lidos do modelo sem escrever nada.
  def test_camera_facts_report_shadows_and_line_style_without_touching_the_model
    view = FakeView.new
    $spn_model.shadow_info['DisplayShadows'] = false
    $spn_model.rendering_options = FakeRenderingOptions.new('RenderMode' => 1)
    facts = PLUGIN.camera_facts(view, view.camera)
    assert_equal false, facts[:shadowsOn]
    assert_equal 1, facts[:renderMode]
    assert_equal true, facts[:lineStyle]
    assert_empty $spn_model.rendering_options.written, 'camera_facts só lê'

    $spn_model.shadow_info['DisplayShadows'] = true
    $spn_model.rendering_options = FakeRenderingOptions.new('RenderMode' => 3)
    facts = PLUGIN.camera_facts(view, view.camera)
    assert_equal true, facts[:shadowsOn]
    assert_equal 3, facts[:renderMode]
    assert_nil facts[:lineStyle]
  end

  # Mapa de arestas sem tinta é descartado; com tinta fica; falha de leitura
  # mantém o mapa (o servidor valida de novo).
  def test_edge_map_blank_detects_a_map_without_ink
    blank = File.join(Dir.tmpdir, 'spn-edge-blank.png')
    make_image(blank, 64, 64, 24, 0) { |_x, _y| [255, 255, 255] }
    assert_equal true, PLUGIN.edge_map_blank?(blank)

    inked = File.join(Dir.tmpdir, 'spn-edge-inked.png')
    make_image(inked, 64, 64, 32, 0) { |x, y| (x % 16).zero? || (y % 8).zero? ? [0, 0, 0] : [255, 255, 255] }
    assert_equal false, PLUGIN.edge_map_blank?(inked)

    faint = File.join(Dir.tmpdir, 'spn-edge-faint.png')
    # Só 1 coluna escura em 64: 1/4 das colunas amostradas (0,16,32,48) → 25 % — não é vazio.
    make_image(faint, 64, 64, 24, 0) { |x, _y| x.zero? ? [0, 0, 0] : [255, 255, 255] }
    assert_equal false, PLUGIN.edge_map_blank?(faint)

    assert_equal false, PLUGIN.edge_map_blank?('/nope/missing.png'), 'falha de leitura mantém o mapa'
  end

  # Cancelar conta se o POST que cobra já tinha saído — sem relógio.
  def test_cancel_reports_whether_the_charging_post_had_left
    PLUGIN.instance_variable_set(:@generating, true)
    PLUGIN.instance_variable_set(:@generate_request, nil)
    PLUGIN.handle_cancel
    idle = events('status').last
    assert_equal 'idle', idle['stage']
    assert_equal true, idle['cancelled']
    assert_equal false, idle['posted']

    PLUGIN.instance_variable_set(:@generating, true)
    PLUGIN.instance_variable_set(:@generate_request, Object.new) # request.cancel levanta → rescue
    PLUGIN.handle_cancel
    assert_equal true, events('status').last['posted']
  end

  # O veredito do servidor sobre a semente viaja no resultado; sem o campo
  # (servidor antigo) fica nil e o lote segue compartilhando como antes.
  def test_finish_generation_keeps_the_server_verdict_on_the_seed
    stubs = { :persist_last_result => proc { |_r| }, :journal_add => proc { |_e| }, :notify_panel => proc { |_m| } }
    stubs.each { |name, body| PLUGIN.define_singleton_method(name, &body) }
    begin
      PLUGIN.instance_variable_set(:@generating, true)
      PLUGIN.finish_generation({ 'outputUrl' => 'https://x/a.png', 'seed' => 77, 'seedApplied' => false })
      assert_equal false, events('result').last['seedApplied']
      assert_equal 77, events('result').last['seed']

      PLUGIN.instance_variable_set(:@generating, true)
      PLUGIN.finish_generation({ 'outputUrl' => 'https://x/b.png', 'seed' => 78 })
      assert_nil events('result').last['seedApplied']
    ensure
      stubs.each_key { |name| PLUGIN.singleton_class.send(:remove_method, name) }
    end
  end

  # O corpo do /api/generate leva a origem declarada e, na correção, a MESMA
  # semente com structuralBoost — nunca sem semente e nunca com âncora.
  def test_generate_payload_declares_the_client_and_carries_the_structural_boost
    base = { 'projectType' => 'interior', 'engine' => 'vega', 'resolution' => '2k' }
    body = PLUGIN.build_generate_payload('src-key', base)
    assert_equal({ :kind => 'sketchup', :version => PLUGIN::VERSION }, body[:client])
    refute body.key?(:structuralBoost)
    refute body.key?(:seed)

    boosted = PLUGIN.build_generate_payload('src-key', base.merge('structuralBoost' => true, 'seed' => 777))
    assert_equal 777, boosted[:seed]
    assert_equal true, boosted[:structuralBoost]
    refute boosted.key?(:anchorUrl)

    no_seed = PLUGIN.build_generate_payload('src-key', base.merge('structuralBoost' => true))
    refute no_seed.key?(:structuralBoost), 'sem semente não há o que corrigir'
  end

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

  # O passe do edge map liga aresta, tira céu/chão e fixa fundo branco /
  # aresta preta — e devolve TUDO; a foto (CLEAN) não carrega nenhuma dessas
  # chaves, porque ela respeita o estilo do usuário.
  def test_edge_pass_neutralises_sky_and_colours_only_during_the_pass
    colors = PLUGIN.edge_pass_colors
    assert_equal %w[BackgroundColor FaceBackColor FaceFrontColor ForegroundColor], colors.keys.sort
    sky = Sketchup::Color.new(120, 160, 220)
    ro = FakeRenderingOptions.new(
      'RenderMode' => 3, 'EdgeDisplayMode' => 0, 'DrawHorizon' => true, 'DrawGround' => true,
      'EdgeColorMode' => 1, 'SectionCutWidth' => 3, 'BackgroundColor' => sky, 'ForegroundColor' => sky,
      'FaceFrontColor' => sky, 'FaceBackColor' => sky, 'DisplayFog' => true
    )
    antes = ro.snapshot
    saved = PLUGIN.apply_rendering_options(ro, PLUGIN::EDGE_CAPTURE_OPTIONS.merge(colors))
    assert_equal 1, ro['RenderMode'], 'hidden line'
    assert_equal 1, ro['EdgeDisplayMode'], 'aresta ligada mesmo em estilo sem arestas'
    assert_equal false, ro['DrawHorizon']
    assert_equal false, ro['DrawGround']
    assert_equal 0, ro['EdgeColorMode']
    assert_equal 1, ro['SectionCutWidth']
    assert_equal 255, ro['BackgroundColor'].red
    assert_equal 0, ro['ForegroundColor'].red
    PLUGIN.restore_rendering_options(ro, saved)
    assert_equal antes, ro.snapshot, 'o passe do edge devolve o estilo inteiro'
    %w[EdgeDisplayMode DrawHorizon DrawGround EdgeColorMode BackgroundColor ForegroundColor].each do |k|
      refute PLUGIN::CLEAN_CAPTURE_OPTIONS.key?(k), "a foto não força #{k}"
    end
  end

  # O Ruby 2.6 desta máquina não prova o que o 3.2 do SketchUp removeu:
  # uma varredura estática barra as APIs que sumiram.
  def test_no_api_removed_in_ruby_3_is_used
    removed = /File\.exists\?|Dir\.exists\?|URI\.(escape|encode|decode)\b|\.filter_map\b|\.tally\b|Fixnum|Bignum/
    %w[sketchup/spacenode.rb sketchup/spacenode/main.rb sketchup/spacenode/glass_bar.rb].each do |rel|
      File.readlines(File.expand_path("../#{rel}", __dir__), :encoding => 'UTF-8').each_with_index do |line, i|
        code = line.sub(/#.*/, '')
        refute_match removed, code, "#{rel}:#{i + 1}"
      end
    end
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

  # COLORREF é 0x00BBGGRR. Trocar R por B é o erro silencioso do DWM: a cor
  # "funciona" e sai errada. #0b0b0d tem R≠B justamente pra pegar isso.
  def test_chrome_color_swaps_red_and_blue
    chrome = SpaceNode::SketchUp::Win32Chrome
    assert_equal 0x0D0B0B, chrome.bgr(0x0B0B0D)
    assert_equal 0x0A0A0A, chrome.bgr(0x0A0A0A)
    assert_equal 0x00FF00, chrome.bgr(0x00FF00)
    assert_equal 0xFF0000, chrome.bgr(0x0000FF)
  end

  # A posição guardada pode apontar pra um monitor que não existe mais. O que
  # importa não é "está dentro", é sobrar barra de título pegável.
  def with_screen(bounds)
    chrome = SpaceNode::SketchUp::Win32Chrome
    original = chrome.method(:virtual_screen)
    chrome.define_singleton_method(:virtual_screen) { bounds }
    yield
  ensure
    chrome.define_singleton_method(:virtual_screen) { original.call }
  end

  def test_offscreen_toolbar_comes_back_to_a_reachable_spot
    with_screen([0, 0, 1920, 1080]) do
      # Dentro da tela não se mexe.
      assert_equal [300, 200], PLUGIN.onscreen_toolbar_spot(300, 200, 312, 108)
      # Monitor desligado: x muito à direita volta deixando 96 px pegáveis.
      assert_equal [1824, 200], PLUGIN.onscreen_toolbar_spot(5000, 200, 312, 108)
      # Acima do topo (barra de título inalcançável) desce pro 0.
      assert_equal [300, 0], PLUGIN.onscreen_toolbar_spot(300, -400, 312, 108)
      # Abaixo do fundo sobe deixando 44 px.
      assert_equal [300, 1036], PLUGIN.onscreen_toolbar_spot(300, 3000, 312, 108)
    end
  end

  def test_second_monitor_to_the_left_is_a_valid_spot
    # Com dois monitores o secundário tem x NEGATIVO. Testar contra o primário
    # jogaria fora uma posição perfeitamente boa.
    with_screen([-1920, 0, 3840, 1080]) do
      assert_equal [-1800, 300], PLUGIN.onscreen_toolbar_spot(-1800, 300, 312, 108)
      assert_equal [-1920, 300], PLUGIN.onscreen_toolbar_spot(-4000, 300, 312, 108)
    end
  end

  def test_without_screen_info_the_saved_spot_is_honoured
    with_screen(nil) do
      assert_equal [742, 91], PLUGIN.onscreen_toolbar_spot(742, 91, 312, 108)
    end
  end

  # Fora do Windows tem que devolver false sem levantar — o painel chama isso
  # a cada applyTheme, inclusive quando o SO troca de tema sozinho.
  def test_window_chrome_is_a_no_op_off_windows
    refute PLUGIN.apply_window_chrome('light')
    assert_equal 'light', PLUGIN.instance_variable_get(:@frame_theme)
    refute PLUGIN.apply_window_chrome('dark')
    assert_equal 'dark', PLUGIN.instance_variable_get(:@frame_theme)
    # Qualquer coisa que não seja 'light' cai em escuro, inclusive nil.
    refute PLUGIN.apply_window_chrome(nil)
    assert_equal 'dark', PLUGIN.instance_variable_get(:@frame_theme)
  end

  # ── Barra nativa (glass_bar.rb): a lógica pura, contra o atlas REAL ───────

  GLASS = SpaceNode::SketchUp::GlassBar
  GLASS_DIR = File.expand_path('../sketchup/spacenode/assets/glassbar', __dir__)

  def glass_atlas
    @glass_atlas ||= JSON.parse(File.read(File.join(GLASS_DIR, '1.json')))
  end

  # Fora do Windows (e no harness, onde Sketchup.platform nem existe) ela se
  # declara indisponível sem levantar — é isso que manda o macOS pro HtmlDialog.
  def test_glass_bar_is_off_outside_windows
    refute GLASS.available?
    refute GLASS.visible?
  end

  def test_glass_bar_picks_the_smallest_scale_that_covers_the_dpi
    assert_equal 1, GLASS.pick_scale(96)
    assert_equal 1.25, GLASS.pick_scale(120)
    assert_equal 1.5, GLASS.pick_scale(144)
    assert_equal 2, GLASS.pick_scale(192)
    assert_equal 2, GLASS.pick_scale(288) # acima de 2x fica no 2x
    assert_equal '1', GLASS.scale_name(1)
    assert_equal '1.25', GLASS.scale_name(1.25)
    assert_equal '2', GLASS.scale_name(2)
  end

  def test_glass_bar_hit_test_uses_the_real_layout
    lay = glass_atlas['layout']['horizontal']
    c = lay['cells']['capture']
    assert_equal 'capture', GLASS.hit_test(lay, c['x'] + 5, c['y'] + 5)
    # pontinhos e folgas são placa: arrastável
    assert_equal :plate, GLASS.hit_test(lay, lay['plate']['x'] + 3, lay['plate']['y'] + 27)
    # fora da placa é transparente ao mouse
    assert_nil GLASS.hit_test(lay, 2, 2)
    tip = { 'x' => 0, 'y' => 0, 'w' => 10, 'h' => 10 }
    assert_equal :tip, GLASS.hit_test(lay, 2, 2, tip)
    v = glass_atlas['layout']['vertical']
    assert_equal 'edit', GLASS.hit_test(v, v['cells']['edit']['x'] + 1, v['cells']['edit']['y'] + 1)
  end

  def test_glass_bar_tip_and_disabled_follow_the_state
    idle = { :disabled => %w[generate edit], :busy => nil }
    assert_equal 'offline', GLASS.tip_key_for('generate', idle)
    assert_equal 'needRender', GLASS.tip_key_for('edit', idle)
    assert_equal 'capture', GLASS.tip_key_for('capture', idle)
    assert GLASS.cell_disabled?('edit', idle)
    refute GLASS.cell_disabled?('capture', idle)
    busy = { :disabled => [], :busy => 'generate' }
    assert_equal 'busy', GLASS.tip_key_for('generate', busy)
    assert GLASS.cell_disabled?('capture', busy) # tudo trava enquanto gera
    refute GLASS.cell_disabled?('generate', busy)
    refute GLASS.cell_disabled?('panel', busy) # a marca nunca trava
  end

  def test_glass_bar_tip_caret_lands_on_the_button
    lay = glass_atlas['layout']['horizontal']
    s = glass_atlas['sprites']['tip_h_pt_capture']
    c = lay['cells']['capture']
    x, y = GLASS.tip_origin(lay, s, c)
    assert_equal c['x'] + c['w'] / 2, x + s['caret']['x']
    assert_equal lay['plate']['y'] + lay['plate']['h'] + lay['tip']['gap'], y + s['caret']['y']
    v = glass_atlas['layout']['vertical']
    sv = glass_atlas['sprites']['tip_v_en_edit']
    cv = v['cells']['edit']
    x, y = GLASS.tip_origin(v, sv, cv)
    assert_equal v['plate']['x'] + v['plate']['w'] + v['tip']['gap'], x + sv['caret']['x']
    assert_equal cv['y'] + cv['h'] / 2, y + sv['caret']['y']
  end

  # A marca do atlas é o N estrutural do manual v2 (três partes, juntas
  # abertas): numa linha a 22 % da altura do sprite icon_panel há TRÊS blocos
  # opacos (apoio | ligação | apoio). O N "micro" sólido de antes da 1.9.0
  # tinha dois — e voltou a aparecer uma vez porque o gerador lia só o
  # primeiro <path> do SVG. As dicas rasterizadas levam a grafia do manual.
  # Conta blocos opacos numa linha de alfa (BGRA, 4º byte): é o critério que
  # separa o N estrutural (3) do N sólido antigo (2).
  def opaque_blocks(pixels, atlas_w, sprite, frac)
    y = sprite['y'] + (sprite['h'] * frac).round
    blocks = 0
    prev = false
    sprite['w'].times do |i|
      opaque = pixels.getbyte(((y * atlas_w) + sprite['x'] + i) * 4 + 3) > 128
      blocks += 1 if opaque && !prev
      prev = opaque
    end
    blocks
  end

  def test_opaque_block_counter_tells_the_old_solid_n_from_the_structural_one
    # Linha sintética de 28 px: [apoio][vão][ligação][vão][apoio] → 3; sem os vãos → 2.
    row = ->(pattern) { pattern.chars.map { |c| [0, 0, 0, c == '#' ? 255 : 0].pack('C4') }.join }
    sprite = { 'x' => 0, 'y' => 0, 'w' => 28, 'h' => 1 }
    assert_equal 3, opaque_blocks(row.call('######....########....######'), 28, sprite, 0)
    assert_equal 2, opaque_blocks(row.call('##########....##############'), 28, sprite, 0)
    assert_equal 1, opaque_blocks(row.call('############################'), 28, sprite, 0)
  end

  def test_atlas_mark_is_the_structural_n_and_tips_use_the_brand_spelling
    %w[1 1.25 1.5 2].each do |scale|
      json = JSON.parse(File.read(File.join(GLASS_DIR, "#{scale}.json")))
      pixels = Zlib.inflate(File.binread(File.join(GLASS_DIR, "#{scale}.bin.z")))
      blocks = opaque_blocks(pixels, json['atlas']['w'], json['sprites']['icon_panel'], 0.22)
      assert_equal 3, blocks, "escala #{scale}: a marca do atlas não é o N estrutural"
      refute_match(/SPACENODE/, JSON.generate(json['labels']), "escala #{scale}: dica com grafia antiga")
    end
  end

  # Cada escala precisa ter os MESMOS sprites e pixels do tamanho anunciado:
  # é o que o Ruby copia direto pra DIB sem conferir nada.
  def test_every_scale_ships_the_same_sprites_and_a_consistent_atlas
    names = nil
    %w[1 1.25 1.5 2].each do |scale|
      json = JSON.parse(File.read(File.join(GLASS_DIR, "#{scale}.json")))
      pixels = Zlib.inflate(File.binread(File.join(GLASS_DIR, "#{scale}.bin.z")))
      assert_equal json['atlas']['w'] * json['atlas']['h'] * 4, pixels.bytesize, "escala #{scale}"
      names ||= json['sprites'].keys.sort
      assert_equal names, json['sprites'].keys.sort, "escala #{scale}"
      json['sprites'].each_value do |s|
        assert s['x'] + s['w'] <= json['atlas']['w'] && s['y'] + s['h'] <= json['atlas']['h'], "escala #{scale}"
      end
      %w[horizontal vertical].each do |o|
        lay = json['layout'][o]
        lay['cells'].each_value { |c| assert GLASS.inside?(lay['plate'], c['x'], c['y']), "#{scale}/#{o}" }
      end
    end
  end

  def with_glass_bar(available:, shown:)
    originals = %i[available? visible? suggested_spot show].map { |m| [m, GLASS.method(m)] }
    calls = []
    GLASS.define_singleton_method(:available?) { available }
    GLASS.define_singleton_method(:visible?) { false }
    GLASS.define_singleton_method(:suggested_spot) { |_w, _h| [10, 20] }
    GLASS.define_singleton_method(:show) { |*args, **_kw| calls << args[0, 3]; shown }
    yield calls
  ensure
    # Ruby < 3 passa **k vazio como um Hash posicional e quebra métodos de
    # aridade zero (available?): só repassa kwargs quando existem — assim o
    # harness roda no Ruby 2.6 do macOS e no 3.2 do SketchUp.
    originals.each do |m, orig|
      GLASS.define_singleton_method(m) { |*a, **k, &b| k.empty? ? orig.call(*a, &b) : orig.call(*a, **k, &b) }
    end
  end

  # No Windows a barra nativa vem primeiro; se ela não nasce, o HtmlDialog
  # assume no mesmo clique — o usuário nunca fica sem barra.
  def test_show_glass_toolbar_prefers_the_native_bar_and_falls_back
    fake = Class.new do
      def initialize(*); end
      def respond_to?(*); true; end
      def method_missing(*); nil; end
      def respond_to_missing?(*); true; end
    end
    fake.const_set(:STYLE_UTILITY, 2)
    real_dialog = UI.send(:remove_const, :HtmlDialog)
    UI.const_set(:HtmlDialog, fake)
    PLUGIN.instance_variable_set(:@toolbar_dialog, nil)
    Sketchup::PREFS.delete([PREF, 'toolbar_visible'])

    with_glass_bar(available: true, shown: true) do |calls|
      PLUGIN.show_glass_toolbar
      assert_equal [[10, 20, 'horizontal']], calls
      assert_equal true, Sketchup.read_default(PREF, 'toolbar_visible')
      assert_nil PLUGIN.instance_variable_get(:@toolbar_dialog), 'nativa no ar: sem HtmlDialog'
    end

    with_glass_bar(available: true, shown: false) do |calls|
      PLUGIN.show_glass_toolbar
      assert_equal 1, calls.length
      refute_nil PLUGIN.instance_variable_get(:@toolbar_dialog), 'nativa falhou: HtmlDialog assume'
    end
  ensure
    UI.send(:remove_const, :HtmlDialog)
    UI.const_set(:HtmlDialog, real_dialog)
    PLUGIN.instance_variable_set(:@toolbar_dialog, nil)
  end
end
