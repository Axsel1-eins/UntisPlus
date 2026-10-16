/**
 * Example mod: a data transform.
 *
 * `lessons.transform` receives the loaded lessons and returns a new array. Here we drop free
 * periods from every timetable view. The transform is a pure function, so it is easy to reason
 * about and can never corrupt the underlying data.
 */
UntisPlus.register({
  id: 'untisplus.compact',
  name: 'Compact lessons',
  version: '1.0.0',
  author: 'Untis+ examples',
  apiVersion: 1,

  setup(api) {
    api.lessons.transform((lessons) => lessons.filter((l) => l.status !== 'FREE'));
    api.log('free periods will be hidden');
  },
});
