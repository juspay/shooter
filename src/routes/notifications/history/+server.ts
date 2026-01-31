import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Mock notification history storage (in production, use database)
let notificationHistory: Array<{
  id: string;
  title: string;
  message: string;
  category: string;
  timestamp: string;
  success: boolean;
  deviceToken?: string;
  errorMessage?: string;
}> = [
  {
    id: '1',
    title: 'Claude Code Session Started',
    message: 'New coding session initiated',
    category: 'system',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    success: true
  },
  {
    id: '2', 
    title: 'File Edit Notification',
    message: 'Updated src/routes/+page.svelte',
    category: 'feature',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    success: true
  },
  {
    id: '3',
    title: 'Build Complete',
    message: 'SvelteKit build finished successfully',
    category: 'system',
    timestamp: new Date(Date.now() - 900000).toISOString(),
    success: true
  }
];

export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const category = url.searchParams.get('category');
    const since = url.searchParams.get('since');

    let filteredHistory = [...notificationHistory];

    // Filter by category if specified
    if (category) {
      filteredHistory = filteredHistory.filter(n => n.category === category);
    }

    // Filter by timestamp if specified
    if (since) {
      const sinceDate = new Date(since);
      filteredHistory = filteredHistory.filter(n => new Date(n.timestamp) > sinceDate);
    }

    // Sort by timestamp (newest first) and limit results
    filteredHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    filteredHistory = filteredHistory.slice(0, limit);

    return json(filteredHistory);
  } catch (error) {
    console.error('Error fetching notification history:', error);
    return json({ error: 'Failed to fetch notification history' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const notification = await request.json();
    
    // Add new notification to history
    const newNotification = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...notification
    };
    
    notificationHistory.unshift(newNotification);
    
    // Keep only last 100 notifications in memory
    if (notificationHistory.length > 100) {
      notificationHistory = notificationHistory.slice(0, 100);
    }

    return json({ success: true, id: newNotification.id });
  } catch (error) {
    console.error('Error adding notification to history:', error);
    return json({ error: 'Failed to add notification to history' }, { status: 500 });
  }
};