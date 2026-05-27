import { getIndicadoresMacro, getProspectos } from '@/lib/queries'
import { DashboardClient } from '@/components/dashboard-client'

export default async function Dashboard() {
  const [indicadores, prospectos] = await Promise.all([
    getIndicadoresMacro(),
    getProspectos(),
  ])

  return (
    <DashboardClient 
      indicadores={indicadores} 
      prospectos={prospectos} 
    />
  )
}
