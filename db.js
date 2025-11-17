import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set. Gatekeeper cannot connect to Postgres.')
}

// Tune timeouts to fail fast and avoid hanging
const sql = postgres(connectionString, {
  connect_timeout: 10, // seconds
  idle_timeout: 30,    // seconds
  max: 10,             // pool size
})

export default sql
