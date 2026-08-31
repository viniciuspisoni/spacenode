-- Migration: Add cma_stage and gemini_request_id to renders table, preparing for CMA flow and Gemini transition.

-- 1. Add cma_stage column with check constraint
ALTER TABLE public.renders 
ADD COLUMN IF NOT EXISTS cma_stage text CHECK (cma_stage IN ('criar', 'melhorar', 'aprimorar'));

-- 2. Add gemini_request_id column
ALTER TABLE public.renders
ADD COLUMN IF NOT EXISTS gemini_request_id text;

-- 3. Comments describing transition
COMMENT ON COLUMN public.renders.cma_stage IS 'CMA (Criar, Melhorar, Aprimorar) stage of the architectural render';
COMMENT ON COLUMN public.renders.gemini_request_id IS 'Native Google Gemini API request identifier (deprecating fal_request_id)';
