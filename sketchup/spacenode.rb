# frozen_string_literal: true

require 'sketchup.rb'
require 'extensions.rb'

module SpaceNode
  module SketchUp
    unless defined?(EXTENSION)
      EXTENSION = ::SketchupExtension.new('SpaceNode', 'spacenode/main')
      EXTENSION.description = 'Renderiza o viewport atual do SketchUp usando a SpaceNode.'
      EXTENSION.version = '0.1.0'
      EXTENSION.creator = 'SpaceNode'
      EXTENSION.copyright = '2026 SpaceNode'

      ::Sketchup.register_extension(EXTENSION, true)
    end
  end
end
