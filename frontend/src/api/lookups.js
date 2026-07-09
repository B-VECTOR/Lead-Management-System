// Reference-data lookups backed by the real Django API (specs.md §17) — the
// set of assignable roles (Groups) and belts now lives in the database, not
// hardcoded frontend arrays.
import client from './client'

export async function getGroups() {
  const { data } = await client.get('/api/groups/')
  return data
}

export async function getBelts() {
  const { data } = await client.get('/api/belts/')
  return data
}
