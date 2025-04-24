import chokidar from 'chokidar';

export type WatcherEvent = {
  path: string;
};

export function createWatcher(root: string, onChange: (ev: WatcherEvent) => void, ignore: string[] = []) {
  return chokidar
    .watch(root, {
      ignored: [/(^|\/)(\.git)/, ...ignore],
      persistent: true,
      ignoreInitial: true,
    })
    .on('add', p => onChange({ path: p }))
    .on('change', p => onChange({ path: p }))
    .on('unlink', p => onChange({ path: p }));
}