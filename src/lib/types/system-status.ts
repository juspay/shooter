// Health status of the Shooter server, surfaced by the root NavBar status pill.
// String-literal union — hand-written (not expressible in the type-crafter YAML).
export type SystemStatus = 'degraded' | 'error' | 'healthy' | 'unknown';
