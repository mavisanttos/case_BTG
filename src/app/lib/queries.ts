import { createClient } from '@/lib/supabase/server'
import type { IndicadoresMacro, ProspectoExtraido } from '@/lib/types'

export async function getIndicadoresMacro(): Promise<IndicadoresMacro | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('indicadores_macro')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('Error fetching indicadores_macro:', error)
    return null
  }
  
  return data?.[0] || null
}

export async function getProspectos(): Promise<ProspectoExtraido[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('prospectos_extraidos')
    .select('*')
  
  if (error) {
    console.error('Error fetching prospectos:', error)
    return []
  }
  
  return data || []
}

export async function getProspectoByArquivo(arquivoPdf: string): Promise<ProspectoExtraido | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('prospectos_extraidos')
    .select('*')
    .eq('arquivo_pdf', arquivoPdf)
    .single()
  
  if (error) {
    console.error('[v0] Error fetching prospecto:', error)
    return null
  }
  
  return data
}
