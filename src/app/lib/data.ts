// Tipos para o Dashboard BTG
export interface FIIOffer {
  id: string
  reqCvm: string
  name: string
  segment: 'Tijolo' | 'Papel'
  score: number
  priceEmission: number
  pvp: number
  dividendYield: number
  coordinator: string
  adminFee: number
  performanceFee: number
  volumeTotal: number
  // Tijolo specific
  physicalVacancy?: number
  financialVacancy?: number
  avgContractTerm?: number
  mainTenant?: string
  // Papel specific
  avgLtv?: number
  indexer?: string
  mainDebtor?: string
  avgRating?: string
  // Common
  resourceDestination: string
  targetAssets: string
  riskFactors: string[]
  prospectusUrl: string
  cvmUrl: string
}

export interface MacroIndicator {
  name: string
  value: string
  icon: string
  trend?: 'up' | 'down' | 'stable'
}

export interface PortfolioAllocation {
  fiiId: string
  fiiName: string
  segment: 'Tijolo' | 'Papel'
  allocatedValue: number
  percentage: number
}

export interface OptimizationResult {
  allocations: PortfolioAllocation[]
  tijoloPercentage: number
  papelPercentage: number
  estimatedMonthlyIncome: number
  estimatedYield: number
}

// Dados mockados
export const macroIndicators: MacroIndicator[] = [
  { name: 'Taxa Selic Meta', value: '10.75% a.a.', icon: 'landmark', trend: 'stable' },
  { name: 'Taxa DI / CDI', value: '10.65% a.a.', icon: 'zap', trend: 'up' },
  { name: 'Inflação IPCA (12m)', value: '4.50%', icon: 'flame', trend: 'down' },
]

export const fiiOffers: FIIOffer[] = [
  {
    id: '1',
    reqCvm: 'Req CVM 392',
    name: 'BTG Logística FII',
    segment: 'Tijolo',
    score: 92,
    priceEmission: 100.00,
    pvp: 0.97,
    dividendYield: 11.8,
    coordinator: 'BTG Pactual',
    adminFee: 0.95,
    performanceFee: 20,
    volumeTotal: 850000000,
    physicalVacancy: 3.2,
    financialVacancy: 2.8,
    avgContractTerm: 7.5,
    mainTenant: 'Amazon Brasil',
    resourceDestination: 'Aquisição de 3 galpões logísticos AAA localizados no eixo Rio-SP, com foco em last-mile delivery.',
    targetAssets: 'Galpões em Cajamar (SP), Duque de Caxias (RJ) e Extrema (MG)',
    riskFactors: ['Risco de vacância', 'Concentração de inquilinos', 'Risco macroeconômico', 'Liquidez de cotas'],
    prospectusUrl: '#',
    cvmUrl: '#',
  },
  {
    id: '2',
    reqCvm: 'Req CVM 401',
    name: 'XP Malls FII',
    segment: 'Tijolo',
    score: 88,
    priceEmission: 98.50,
    pvp: 0.94,
    dividendYield: 10.5,
    coordinator: 'XP Investimentos',
    adminFee: 1.0,
    performanceFee: 20,
    volumeTotal: 620000000,
    physicalVacancy: 5.1,
    financialVacancy: 4.7,
    avgContractTerm: 5.2,
    mainTenant: 'Grupo Multiplan',
    resourceDestination: 'Expansão do portfólio de shopping centers com foco em regiões metropolitanas de alta renda.',
    targetAssets: 'Shopping Iguatemi (participação adicional), VillageMall',
    riskFactors: ['Risco de e-commerce', 'Concentração geográfica', 'Risco de crédito de lojistas'],
    prospectusUrl: '#',
    cvmUrl: '#',
  },
  {
    id: '3',
    reqCvm: 'Req CVM 415',
    name: 'Kinea High Yield CRI',
    segment: 'Papel',
    score: 85,
    priceEmission: 102.00,
    pvp: 1.02,
    dividendYield: 13.2,
    coordinator: 'Itaú BBA',
    adminFee: 1.1,
    performanceFee: 20,
    volumeTotal: 450000000,
    avgLtv: 65,
    indexer: 'CDI + 3.5%',
    mainDebtor: 'MRV Engenharia',
    avgRating: 'A+',
    resourceDestination: 'Aquisição de carteira diversificada de CRIs com spread elevado sobre CDI.',
    targetAssets: 'CRIs corporativos de emissores investment grade',
    riskFactors: ['Risco de crédito', 'Risco de pré-pagamento', 'Risco de taxa de juros'],
    prospectusUrl: '#',
    cvmUrl: '#',
  },
  {
    id: '4',
    reqCvm: 'Req CVM 423',
    name: 'CSHG Recebíveis FII',
    segment: 'Papel',
    score: 78,
    priceEmission: 95.00,
    pvp: 0.95,
    dividendYield: 12.8,
    coordinator: 'Credit Suisse',
    adminFee: 0.85,
    performanceFee: 15,
    volumeTotal: 380000000,
    avgLtv: 70,
    indexer: 'IPCA + 7.8%',
    mainDebtor: 'Cyrela Brazil Realty',
    avgRating: 'AA-',
    resourceDestination: 'Reforço de carteira de CRIs indexados à inflação.',
    targetAssets: 'CRIs residenciais de alto padrão',
    riskFactors: ['Risco de inadimplência', 'Concentração setorial', 'Risco de duration'],
    prospectusUrl: '#',
    cvmUrl: '#',
  },
  {
    id: '5',
    reqCvm: 'Req CVM 430',
    name: 'Hedge Brasil Shopping',
    segment: 'Tijolo',
    score: 72,
    priceEmission: 88.00,
    pvp: 0.88,
    dividendYield: 9.8,
    coordinator: 'Hedge Investments',
    adminFee: 1.2,
    performanceFee: 20,
    volumeTotal: 280000000,
    physicalVacancy: 8.5,
    financialVacancy: 7.2,
    avgContractTerm: 4.8,
    mainTenant: 'Lojas Renner',
    resourceDestination: 'Revitalização de ativos existentes e aquisição de participações em shoppings regionais.',
    targetAssets: 'Shopping centers em capitais do Nordeste',
    riskFactors: ['Alta vacância atual', 'Risco regional', 'Competição com e-commerce', 'Risco de concentração'],
    prospectusUrl: '#',
    cvmUrl: '#',
  },
  {
    id: '6',
    reqCvm: 'Req CVM 438',
    name: 'Vinci Offices FII',
    segment: 'Tijolo',
    score: 65,
    priceEmission: 82.00,
    pvp: 0.82,
    dividendYield: 8.5,
    coordinator: 'Vinci Partners',
    adminFee: 1.0,
    performanceFee: 20,
    volumeTotal: 200000000,
    physicalVacancy: 12.3,
    financialVacancy: 11.8,
    avgContractTerm: 3.5,
    mainTenant: 'WeWork',
    resourceDestination: 'Aquisição de lajes corporativas em regiões premium de São Paulo.',
    targetAssets: 'Edifícios na Faria Lima e Vila Olímpia',
    riskFactors: ['Alta vacância estrutural', 'Tendência de trabalho remoto', 'Risco de concentração em SP', 'Baixo yield atual'],
    prospectusUrl: '#',
    cvmUrl: '#',
  },
  {
    id: '7',
    reqCvm: 'Req CVM 445',
    name: 'BTG Crédito Estruturado',
    segment: 'Papel',
    score: 91,
    priceEmission: 105.00,
    pvp: 1.05,
    dividendYield: 14.5,
    coordinator: 'BTG Pactual',
    adminFee: 1.15,
    performanceFee: 20,
    volumeTotal: 750000000,
    avgLtv: 58,
    indexer: 'CDI + 4.2%',
    mainDebtor: 'Rede D\'Or São Luiz',
    avgRating: 'AAA',
    resourceDestination: 'Estruturação de operações de crédito garantido para grandes corporações.',
    targetAssets: 'CRIs e debêntures de emissores prime',
    riskFactors: ['Risco de crédito corporativo', 'Concentração em grandes devedores'],
    prospectusUrl: '#',
    cvmUrl: '#',
  },
  {
    id: '8',
    reqCvm: 'Req CVM 452',
    name: 'Guardian Logística',
    segment: 'Tijolo',
    score: 82,
    priceEmission: 96.00,
    pvp: 0.96,
    dividendYield: 10.9,
    coordinator: 'Guardian Gestora',
    adminFee: 0.90,
    performanceFee: 20,
    volumeTotal: 420000000,
    physicalVacancy: 2.1,
    financialVacancy: 1.8,
    avgContractTerm: 8.2,
    mainTenant: 'Mercado Livre',
    resourceDestination: 'Desenvolvimento de centros de distribuição built-to-suit.',
    targetAssets: 'Galpões customizados para e-commerce no interior de SP',
    riskFactors: ['Risco de construção', 'Concentração em único inquilino', 'Risco de localização'],
    prospectusUrl: '#',
    cvmUrl: '#',
  },
]

export const coordinatorVolumes = [
  { name: 'BTG Pactual', volume: 1.6 },
  { name: 'XP Investimentos', volume: 0.62 },
  { name: 'Itaú BBA', volume: 0.45 },
  { name: 'Credit Suisse', volume: 0.38 },
  { name: 'Guardian', volume: 0.42 },
  { name: 'Vinci Partners', volume: 0.20 },
  { name: 'Hedge Investments', volume: 0.28 },
]

export const marketData = [
  { metric: 'Volume Total em Oferta', value: 'R$ 3,95 bi' },
  { metric: 'Número de Ofertas Ativas', value: '8' },
  { metric: 'Yield Médio Projetado', value: '11.5% a.a.' },
  { metric: 'P/VP Médio', value: '0.95' },
  { metric: 'Ofertas Tijolo', value: '5' },
  { metric: 'Ofertas Papel', value: '3' },
]
