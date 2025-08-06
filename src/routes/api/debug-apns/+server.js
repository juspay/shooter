import { json } from '@sveltejs/kit';
import { APNsService } from '$lib/server/apns.js';

export async function GET() {
  try {
    console.log('=== DEBUG APNS ENDPOINT ===');
    
    // Initialize APNs service
    const apnsService = new APNsService();
    
    const debug = {
      isConfigured: apnsService.isConfigured(),
      configError: apnsService.configError || null,
      provider: !!apnsService.provider,
      timestamp: new Date().toISOString()
    };
    
    console.log('APNs Debug Results:', debug);
    
    return json(debug);
    
  } catch (error) {
    console.error('APNs debug error:', error);
    return json({
      error: true,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}