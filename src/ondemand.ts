export interface InstanceSet {
  name: string
  region: string
  price: string
}

export const onDemandPriceDB: Map<string, Array<InstanceSet>> = new Map()

onDemandPriceDB.set('m5.large', [
  { name: 'm5.large', region: 'us-east1', price: '0.002' }
])

onDemandPriceDB.set('c5.large', [
  { name: 'm5.large', region: 'us-east1', price: '0.002' }
])

onDemandPriceDB.set('c5.xlarge', [
  { name: 'm5.large', region: 'us-east1', price: '0.002' }
])

onDemandPriceDB.set('c5.x2large', [
  { name: 'm5.large', region: 'us-east1', price: '0.002' }
])

onDemandPriceDB.set('c5.x2large', [
  { name: 'm5.large', region: 'us-east1', price: '0.002' }
])
