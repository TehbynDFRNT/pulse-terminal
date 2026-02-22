/**
 * Types and static data for the fundamentals-deep feature.
 * Shared between API route (server) and Signal page (client).
 * NO server-side imports here — this is safe for 'use client' components.
 */

// ============ TYPES ============

export interface FundamentalsDeepData {
  energy: EnergyFundamentals;
  ree: REEFundamentals;
  pm: PMFundamentals;
  meta: { fetchedAt: string; errors: string[] };
}

export interface EnergyFundamentals {
  sputHoldings: { lbs: number | null; navPerUnit: number | null; navDiscount: number | null; source: string; asOf: string };
  uraniumSpot: { price: number | null; date: string | null; source: string };
  eiaProduction: { value: number | null; unit: string; period: string | null; source: string };
  reactorCount: { operational: number | null; source: string; asOf: string };
  gridQueue: { totalMW: number | null; source: string; asOf: string };
}

export interface REEFundamentals {
  ndprPrice: { price: number | null; unit: string; source: string; asOf: string };
  copperStocks: { tonnes: number | null; source: string; asOf: string };
  remxFlows: { volume: number | null; avgVolume: number | null; flowDirection: 'inflow' | 'outflow' | 'neutral'; source: string };
  setmFlows: { volume: number | null; avgVolume: number | null; flowDirection: 'inflow' | 'outflow' | 'neutral'; source: string };
  projectPipeline: ProjectMilestone[];
}

export interface PMFundamentals {
  centralBankBuying: { tonnes: number | null; period: string; source: string; asOf: string };
}

export interface ProjectMilestone {
  company: string;
  project: string;
  status: 'on-track' | 'delayed' | 'at-risk' | 'completed' | 'planned';
  expectedDate: string;
  funding: string;
  notes: string;
}

// ============ CATALYST CALENDAR ============

export interface CatalystEvent {
  date: string;
  label: string;
  track: 'energy' | 'ree' | 'pm' | 'all';
  importance: 'high' | 'medium' | 'low';
}

export const CATALYST_CALENDAR: CatalystEvent[] = [
  // Energy
  { date: '2025-02-28', label: 'Kazatomprom FY2024 results', track: 'energy', importance: 'high' },
  { date: '2025-03-06', label: 'NRC new reactor applications update', track: 'energy', importance: 'medium' },
  { date: '2025-03-15', label: 'EIA quarterly uranium report', track: 'energy', importance: 'medium' },
  { date: '2025-04-01', label: 'PJM capacity auction results', track: 'energy', importance: 'high' },
  { date: '2025-04-24', label: 'Microsoft earnings (AI capex guidance)', track: 'energy', importance: 'high' },
  { date: '2025-04-25', label: 'Alphabet earnings (AI capex guidance)', track: 'energy', importance: 'high' },
  { date: '2025-05-01', label: 'Amazon earnings (AI capex guidance)', track: 'energy', importance: 'high' },
  { date: '2025-05-15', label: 'Cameco Q1 results', track: 'energy', importance: 'medium' },
  // REE
  { date: '2025-03-01', label: 'MOFCOM export controls review', track: 'ree', importance: 'high' },
  { date: '2025-03-15', label: 'DFARS CMMC Level 2 deadline', track: 'ree', importance: 'medium' },
  { date: '2025-03-20', label: 'MP Materials Q4 earnings', track: 'ree', importance: 'high' },
  { date: '2025-04-15', label: 'Lynas H1 FY25 results', track: 'ree', importance: 'high' },
  { date: '2025-04-30', label: 'Iluka Eneabba project update', track: 'ree', importance: 'medium' },
  { date: '2025-06-01', label: 'DFARS critical minerals compliance', track: 'ree', importance: 'high' },
  // PM
  { date: '2025-03-12', label: 'US CPI report', track: 'pm', importance: 'high' },
  { date: '2025-03-19', label: 'Fed FOMC decision', track: 'pm', importance: 'high' },
  { date: '2025-04-10', label: 'US CPI report', track: 'pm', importance: 'high' },
  { date: '2025-04-15', label: 'WGC Central Bank Gold Survey', track: 'pm', importance: 'medium' },
  { date: '2025-05-07', label: 'Fed FOMC decision', track: 'pm', importance: 'high' },
  { date: '2025-05-13', label: 'US CPI report', track: 'pm', importance: 'high' },
  { date: '2025-06-18', label: 'Fed FOMC decision + dot plot', track: 'pm', importance: 'high' },
];

// ============ CHINA LEVERAGE CONFIG (manually scored) ============

export interface ChinaLeverageFactor {
  factor: string;
  score: number; // 0-2
  notes: string;
}

export const CHINA_LEVERAGE_CONFIG: ChinaLeverageFactor[] = [
  { factor: 'Ex-China Supply Security', score: 1, notes: 'MP + Lynas operational but limited. No ex-China heavy REE processing at scale.' },
  { factor: 'Financing Momentum', score: 2, notes: 'DOE loans flowing. Bipartisan support. Multiple projects funded.' },
  { factor: 'Processing Capacity', score: 0, notes: 'China still 90%+ of processing. Eneabba delayed. No heavy REE refinery in West.' },
  { factor: 'China Pressure', score: 2, notes: 'MOFCOM export controls active. Germanium/gallium/antimony restricted. REE next.' },
  { factor: 'End-Market Demand', score: 2, notes: 'EV + wind + defense demand structural. NdFeB magnet demand growing 8-10% pa.' },
];

// ============ WESTERN REE PROJECT DATA (manually maintained) ============

export const WESTERN_REE_PROJECTS: ProjectMilestone[] = [
  {
    company: 'MP Materials',
    project: 'Fort Worth Magnets Facility',
    status: 'on-track',
    expectedDate: '2025-H2',
    funding: '$700M+ (incl. DOE loan)',
    notes: 'First US rare earth magnet factory. NdFeB production commissioning.',
  },
  {
    company: 'Lynas Rare Earths',
    project: 'Kalgoorlie Processing',
    status: 'on-track',
    expectedDate: '2025-Q2',
    funding: 'A$500M+',
    notes: 'Cracking & leaching moved from Malaysia to Australia. De-risks supply chain.',
  },
  {
    company: 'Iluka Resources',
    project: 'Eneabba REE Refinery',
    status: 'delayed',
    expectedDate: '2026-H1',
    funding: 'A$1.8B (incl. A$1.25B Govt loan)',
    notes: 'Full separated REE refinery. Delayed from 2025 due to cost escalation.',
  },
  {
    company: 'USA Rare Earth',
    project: 'Stillwater Critical Minerals',
    status: 'planned',
    expectedDate: '2027+',
    funding: '$120M (DOE grant)',
    notes: 'Round Top deposit processing. Pilot phase.',
  },
  {
    company: 'Lithium Americas',
    project: 'Thacker Pass',
    status: 'on-track',
    expectedDate: '2027-H1',
    funding: '$2.3B (incl. DOE loan guarantee)',
    notes: 'Largest known lithium deposit in the US. Phase 1 construction underway.',
  },
  {
    company: 'Arafura Resources',
    project: 'Nolans NdPr Project',
    status: 'at-risk',
    expectedDate: '2027+',
    funding: 'A$1.6B (seeking financing)',
    notes: 'NT, Australia. Final investment decision pending. Financing gap.',
  },
];
