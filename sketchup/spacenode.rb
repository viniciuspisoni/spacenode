# frozen_string_literal: true

# Registro da extensão — só registro, sem lógica (requisito do Extension
# Warehouse). A versão daqui e a de SpaceNode::SketchUp::VERSION em
# spacenode/main.rb precisam andar juntas.

require 'sketchup.rb'
require 'extensions.rb'

module SpaceNode
  module SketchUp
    unless defined?(EXTENSION)
      EXTENSION = ::SketchupExtension.new('SPACENODE', 'spacenode/main')
      EXTENSION.description = 'Renderização fotorrealista das suas vistas do SketchUp com o motor de fidelidade da SPACENODE.'
      EXTENSION.version = '0.8.0'
      EXTENSION.creator = 'SPACENODE TECNOLOGIA LTDA'
      EXTENSION.copyright = '2026 SPACENODE TECNOLOGIA LTDA'

      ::Sketchup.register_extension(EXTENSION, true)
    end
  end
end
