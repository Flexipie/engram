export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Engram REST API',
    version: '1',
    description: 'Universal agent memory layer — any agent that speaks HTTP can use every Engram capability.',
  },
  servers: [
    { url: 'http://localhost:7337', description: 'Local Engram server' },
  ],
  paths: {
    '/v1/memories': {
      post: {
        summary: 'Create a memory',
        operationId: 'createMemory',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'scope', 'content'],
                properties: {
                  type: { type: 'string', enum: ['convention', 'decision', 'anti_pattern', 'snippet', 'error_pattern'] },
                  scope: { type: 'string' },
                  content: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  source: { type: 'string', enum: ['agent', 'manual', 'observer'] },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Memory created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    contradicts_with: {
                      type: 'array',
                      description: 'Memories with high semantic similarity (possible contradictions)',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          content: { type: 'string' },
                          similarity: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      get: {
        summary: 'List memories',
        operationId: 'listMemories',
        parameters: [
          { name: 'scope', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'query', in: 'query', schema: { type: 'string' } },
          { name: 'minConfidence', in: 'query', schema: { type: 'number' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'worktree', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'List of memories',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    memories: { type: 'array', items: { '$ref': '#/components/schemas/Memory' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/memories/{id}': {
      get: {
        summary: 'Get a memory by ID',
        operationId: 'getMemory',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Memory', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Memory' } } } },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        summary: 'Update a memory',
        operationId: 'updateMemory',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        summary: 'Soft-delete (invalidate) a memory',
        operationId: 'deleteMemory',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/v1/sessions': {
      post: {
        summary: 'Start or resume a session',
        operationId: 'startSession',
        responses: { '200': { description: 'ContextPacket' } },
      },
    },
    '/v1/sessions/current': {
      get: {
        summary: 'Get current active task',
        operationId: 'getCurrentSession',
        responses: {
          '200': { description: 'Task and state' },
          '404': { description: 'No active task' },
        },
      },
      patch: {
        summary: 'Create or update task',
        operationId: 'updateCurrentSession',
        responses: { '200': { description: 'Task ID' } },
      },
    },
    '/v1/sessions/{id}/snapshot': {
      post: {
        summary: 'Create a task snapshot',
        operationId: 'createSnapshot',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: 'Snapshot created' } },
      },
    },
    '/v1/errors/check': {
      post: {
        summary: 'Check if an error is known',
        operationId: 'checkError',
        responses: { '200': { description: 'Error lookup result' } },
      },
    },
    '/v1/errors/record': {
      post: {
        summary: 'Record an error pattern',
        operationId: 'recordError',
        responses: { '201': { description: 'Error recorded' } },
      },
    },
    '/v1/errors': {
      get: {
        summary: 'List error patterns',
        operationId: 'listErrors',
        responses: { '200': { description: 'Error patterns' } },
      },
    },
    '/v1/recall': {
      post: {
        summary: 'Recall memories as a context packet',
        operationId: 'recall',
        responses: { '200': { description: 'ContextPacket' } },
      },
    },
    '/v1/enforce': {
      post: {
        summary: 'Check conventions for a file',
        operationId: 'enforce',
        responses: { '200': { description: 'Enforcement result' } },
      },
    },
    '/v1/stats': {
      get: {
        summary: 'Get per-tool call telemetry and enforcement stats',
        operationId: 'getStats',
        responses: {
          '200': {
            description: 'Tool and enforcement statistics (reset on server restart)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tools: {
                      type: 'object',
                      properties: {
                        session_start: { type: 'object', properties: { calls: { type: 'integer' }, task_hits: { type: 'integer' } } },
                        remember: { type: 'object', properties: { calls: { type: 'integer' } } },
                        recall: { type: 'object', properties: { calls: { type: 'integer' }, memories_returned: { type: 'integer' } } },
                        check_error: { type: 'object', properties: { calls: { type: 'integer' }, hits: { type: 'integer' } } },
                        record_error: { type: 'object', properties: { calls: { type: 'integer' } } },
                        invalidate: { type: 'object', properties: { calls: { type: 'integer' } } },
                        update_task: { type: 'object', properties: { calls: { type: 'integer' } } },
                        get_worktree_status: { type: 'object', properties: { calls: { type: 'integer' } } },
                        check_conventions: { type: 'object', properties: { calls: { type: 'integer' } } },
                      },
                    },
                    enforcement: {
                      type: 'object',
                      properties: {
                        checks: { type: 'integer' },
                        violations: { type: 'integer' },
                        warnings: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Memory: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          scope: { type: 'string' },
          content: { type: 'string' },
          confidence: { type: 'number' },
          source: { type: 'string' },
          evidence_count: { type: 'integer' },
          invalidated: { type: 'integer' },
          created_at: { type: 'string' },
          updated_at: { type: 'string' },
        },
      },
    },
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
  },
}
