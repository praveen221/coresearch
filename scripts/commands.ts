export const coreCommands = [
  'setup', 'workspace', 'start', 'status', 'stop', 'update', 'guide',
  'profile:get', 'profile:update', 'profile:schema',
  'target:list', 'target:get', 'target:add', 'target:update', 'target:remove', 'target:schema',
] as const;
export type CoreCommand = (typeof coreCommands)[number];
