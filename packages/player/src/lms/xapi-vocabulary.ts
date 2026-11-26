/** ADL verb and activity-type IRIs used by the xAPI and cmi5 drivers (P5.4, P5.5) and their packages. */

export interface XapiVerb {
  id: string;
  display: Record<string, string>;
}

const adlVerb = (name: string): XapiVerb => ({
  id: `http://adlnet.gov/expapi/verbs/${name}`,
  display: { 'en-US': name },
});

export const xapiVerbs = {
  initialized: adlVerb('initialized'),
  experienced: adlVerb('experienced'),
  attempted: adlVerb('attempted'),
  answered: adlVerb('answered'),
  passed: adlVerb('passed'),
  failed: adlVerb('failed'),
  completed: adlVerb('completed'),
  terminated: adlVerb('terminated'),
} as const satisfies Record<string, XapiVerb>;

export const xapiActivityTypes = {
  course: 'http://adlnet.gov/expapi/activities/course',
  module: 'http://adlnet.gov/expapi/activities/module',
  lesson: 'http://adlnet.gov/expapi/activities/lesson',
  assessment: 'http://adlnet.gov/expapi/activities/assessment',
  interaction: 'http://adlnet.gov/expapi/activities/cmi.interaction',
  /** From the xAPI registry; ADL defines no slide type. */
  slide: 'http://id.tincanapi.com/activitytype/slide',
} as const;
