export const coreCommands = [
  'setup', 'workspace', 'start', 'status', 'stop', 'update', 'guide',
  'profile:get', 'profile:update', 'profile:schema', 'profile:cv', 'profile:cv-text',
  'target:list', 'target:get', 'target:add', 'target:update', 'target:remove', 'target:schema',
  'list:preview', 'list:import', 'outreach:list', 'outreach:contacts', 'contact:cite',
  'fit:get', 'fit:score', 'fit:schema',
  'pitch:get', 'pitch:draft', 'pitch:edit', 'pitch:status', 'pitch:schema',
] as const;
export type CoreCommand = (typeof coreCommands)[number];
