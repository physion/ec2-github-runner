const core = require('@actions/core');
const github = require('@actions/github');
const _ = require('lodash');
const config = require('./config');

// use the unique label to find the runner
// as we don't have the runner's id, it's not possible to get it in any other way
async function getRunners(label) {
  const octokit = github.getOctokit(config.input.githubToken);

  try {
    const runners = await octokit.paginate('GET /repos/{owner}/{repo}/actions/runners', config.githubContext);
    return _.filter(runners, { labels: [{ name: label }] });
  } catch (error) {
    core.error(`Error fetching current runners: ${error}`)
    return [];
  }
}

// get GitHub Registration Token for registering a self-hosted runner
async function getRegistrationToken() {
  const octokit = github.getOctokit(config.input.githubToken);

  try {
    const response = await octokit.request('POST /repos/{owner}/{repo}/actions/runners/registration-token', config.githubContext);
    core.info('GitHub Registration Token is received');
    return response.data.token;
  } catch (error) {
    core.error('GitHub Registration Token receiving error');
    throw error;
  }
}

async function removeRunners() {
  const runners = await getRunners(config.input.label);
  const octokit = github.getOctokit(config.input.githubToken);

  // skip the runner removal process if the runner is not found
  if (!runners || runners.length === 0) {
    core.info(`GitHub self-hosted runners with label ${config.input.label} are not found, so the removal is skipped`);
    return;
  }

  try {
    await Promise.all(runners.map(r => octokit.request('DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}', _.merge(config.githubContext, { runner_id: r.id }))));
    core.info(`GitHub self-hosted runners ${runners.map(r => r.name)} are removed`);
    return;
  } catch (error) {
    core.error('GitHub self-hosted runners removal error');
    throw error;
  }
}

async function waitForRunnersRegistered(label, expectedRunnerCount) {
  const timeoutMinutes = 5;
  const retryIntervalSeconds = 10;
  const quietPeriodSeconds = 30;
  let waitSeconds = 0;

  core.info(`Waiting ${quietPeriodSeconds}s for the AWS EC2 instances to be registered in GitHub as the new self-hosted runners`);
  await new Promise((r) => setTimeout(r, quietPeriodSeconds * 1000));
  core.info(`Checking every ${retryIntervalSeconds}s if the GitHub self-hosted runners are registered`);

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      const runners = await getRunners(label);

      if (waitSeconds > timeoutMinutes * 60) {
        core.error('GitHub self-hosted runners registration error');
        clearInterval(interval);
        reject(
          `A timeout of ${timeoutMinutes} minutes is exceeded. Your AWS EC2 instances were not able to register themselves in GitHub as the new self-hosted runners.`,
        );
      }

      if (runners && runners.length == expectedRunnerCount && runners.every(r => r.status === 'online')) {
        core.info(`GitHub self-hosted runners ${JSON.stringify(runners.map(r => r.name))} are registered and ready to use`);
        clearInterval(interval);
        resolve();
      } else {
        waitSeconds += retryIntervalSeconds;
        core.info('Checking...');
      }
    }, retryIntervalSeconds * 1000);
  });
}

module.exports = {
  getRegistrationToken,
  removeRunners,
  waitForRunnersRegistered,
};
