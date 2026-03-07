const jobs = {};

export function startJob(type) {
  jobs[type] = {
    status: 'running',
    started_at: Date.now(),
    total: 0,
    completed: 0,
    failed: 0,
    message: '',
  };
  return jobs[type];
}

export function updateJob(type, updates) {
  if (jobs[type]) Object.assign(jobs[type], updates);
}

export function finishJob(type, message) {
  if (jobs[type]) {
    jobs[type].status = 'done';
    jobs[type].finished_at = Date.now();
    jobs[type].message = message || '';
  }
}

export function failJob(type, message) {
  if (jobs[type]) {
    jobs[type].status = 'error';
    jobs[type].finished_at = Date.now();
    jobs[type].message = message || '';
  }
}

export function getAllJobs() {
  return { ...jobs };
}
