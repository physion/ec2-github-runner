const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

function setOutput(label, ec2InstanceIds) {
  core.setOutput('label', label);
  core.setOutput('ec2-instance-id', JSON.stringify(ec2InstanceIds));
}

async function start() {
  const label = config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  const ec2InstanceIds = await aws.startEc2Instances(label, config.input.ec2InstanceCount, githubRegistrationToken);
  setOutput(label, ec2InstanceIds);
  await aws.waitForInstancesRunning(ec2InstanceIds);
  await gh.waitForRunnersRegistered(label, config.input.ec2InstanceCount);
}

async function stop() {
  const keepRunnerOnStop = config.input.keepRunnerOnStop === true;

  // Don't terminate the EC2 instances if the runner is kept for debugging
  if (!keepRunnerOnStop) {
    await aws.terminateEc2Instances();
  }

  // We do want to still de-register the runner since we can't re-use it once the build stops
  // this prevents the runners from being registered indefinitely
  await gh.removeRunners();
}

(async function () {
  try {
    config.input.mode === 'start' ? await start() : await stop();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
