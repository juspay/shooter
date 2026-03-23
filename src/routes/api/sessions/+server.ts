import type { ProjectGroup } from '$lib/modules/server/sessions/types';

import { validateAuth } from '$lib/modules/server/auth';
import {
  getSessionConversation,
  listProjectsWithSessions,
} from '$lib/modules/server/sessions/jsonl-reader';
import {
  getOpenCodeConversation,
  listOpenCodeProjects,
} from '$lib/modules/server/sessions/opencode-reader';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// Server-side cache for merged projects (30s TTL)
let cachedProjects: null | ProjectGroup[] = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

function getMergedProjects(): ProjectGroup[] {
  const now = Date.now();
  if (cachedProjects && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProjects;
  }

  const claudeProjects = listProjectsWithSessions();
  const openCodeProjects = listOpenCodeProjects();
  const projectsByPath = new Map<string, ProjectGroup>();

  for (const p of claudeProjects) {
    projectsByPath.set(p.fullPath, { ...p });
  }

  for (const op of openCodeProjects) {
    const existing = projectsByPath.get(op.fullPath);
    if (existing) {
      existing.sessions.push(...op.sessions);
      existing.sessions.sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
      );
      existing.sessionCount = existing.sessions.length;
      existing.lastModified = existing.sessions[0]?.modified || existing.lastModified;
      existing.name = existing.name.replace(' (OpenCode)', '');
    } else {
      op.name = op.name.replace(' (OpenCode)', '');
      projectsByPath.set(op.fullPath, { ...op });
    }
  }

  cachedProjects = [...projectsByPath.values()].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
  cacheTimestamp = now;
  return cachedProjects;
}

export const GET: RequestHandler = ({ request, url }) => {
  const authError = validateAuth(request);
  if (authError) {return authError;}

  const sessionId = url.searchParams.get('id');

  if (sessionId) {
    const projectId = url.searchParams.get('project') || '';
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    // Resolve short project ID to full path for the readers
    const allProjects = getMergedProjects();
    const matchedProject = projectId ? allProjects.find((p) => p.id === projectId) : undefined;

    // Try Claude Code first (pass the encoded dir name for filesystem lookup)
    const claudeProjectDir = matchedProject
      ? matchedProject.fullPath.replace(/\//g, '-')
      : undefined;
    let messages = getSessionConversation(sessionId, offset, limit, claudeProjectDir);

    // If Claude Code reader found nothing, try OpenCode
    if (messages.length === 0) {
      messages = getOpenCodeConversation(sessionId, offset, limit);
    }
    let sessionInfo = null;
    for (const project of allProjects) {
      if (projectId && project.id !== projectId) {
        continue;
      }
      const found = project.sessions.find((s) => s.id === sessionId);
      if (found) {
        sessionInfo = found;
        break;
      }
    }

    if (!sessionInfo) {
      return json({ error: 'Session not found' }, { status: 404 });
    }

    return json({
      messages,
      session: sessionInfo,
      timestamp: new Date().toISOString(),
    });
  }

  const allProjects = getMergedProjects();

  const limit = parseInt(url.searchParams.get('limit') || '0');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const total = allProjects.length;
  const paginatedProjects = limit > 0 ? allProjects.slice(offset, offset + limit) : allProjects;

  return json({
    count: allProjects.reduce((sum, p) => sum + p.sessionCount, 0),
    projects: paginatedProjects,
    timestamp: new Date().toISOString(),
    total,
  });
};
