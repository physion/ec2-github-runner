const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

// User data scripts are run as the root user
function buildUserDataScript(githubRegistrationToken, label) {
  if (config.input.runnerHomeDir) {
    // If runner home directory is specified, we expect the actions-runner software (and dependencies)
    // to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
    return [
      '#!/bin/bash',
      `cd "${config.input.runnerHomeDir}"`,
      `echo "${config.input.preRunnerScript}" > pre-runner-script.sh`,
      'source pre-runner-script.sh',
      'export RUNNER_ALLOW_RUNASROOT=1',
      'sudo echo "export RUNNER_ALLOW_RUNASROOT=1" >> /etc/profile.d/env.sh',
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      'sudo echo "export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1" >> /etc/profile.d/env.sh',
      'export DOTNET_SYSTEM_GLOBALIZATION_PREDEFINED_CULTURES_ONLY=false',
      'sudo echo "export DOTNET_SYSTEM_GLOBALIZATION_PREDEFINED_CULTURES_ONLY=false" >> /etc/profile.d/env.sh',
      `./config.sh --unattended --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label} --name $(hostname | cut -c1-27)-$(uuidgen)`,
      './run.sh',
    ];
  } else {
    return [
      '#!/bin/bash',
      'mkdir actions-runner && cd actions-runner',
      `echo "${config.input.preRunnerScript}" > pre-runner-script.sh`,
      'source pre-runner-script.sh',
      'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      'curl -O -L https://github.com/actions/runner/releases/download/v2.299.1/actions-runner-linux-${RUNNER_ARCH}-2.299.1.tar.gz',
      'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.299.1.tar.gz',
      'export RUNNER_ALLOW_RUNASROOT=1',
      'sudo echo "export RUNNER_ALLOW_RUNASROOT=1" >> /etc/profile.d/env.sh',
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      'sudo echo "export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1" >> /etc/profile.d/env.sh',
      'export DOTNET_SYSTEM_GLOBALIZATION_PREDEFINED_CULTURES_ONLY=false',
      'sudo echo "export DOTNET_SYSTEM_GLOBALIZATION_PREDEFINED_CULTURES_ONLY=false" >> /etc/profile.d/env.sh',
      `./config.sh --unattended --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label} --name $(hostname | cut -c1-27)-$(uuidgen)`,
      './run.sh',
    ];
  }
}

async function startEc2Instances(label, count, githubRegistrationToken) {
  const ec2 = new AWS.EC2();

  // User data scripts are run as the root user.
  // Docker and git are necessary for GitHub runner and should be pre-installed on the AMI.
  const userData = buildUserDataScript(githubRegistrationToken, label);

  const params = {
    ImageId: config.input.ec2ImageId,
    InstanceType: config.input.ec2InstanceType,
    MinCount: count,
    MaxCount: count,
    UserData: Buffer.from(userData.join('\n')).toString('base64'),
    SubnetId: config.input.subnetId,
    SecurityGroupIds: [config.input.securityGroupId],
    IamInstanceProfile: { Name: config.input.iamRoleName },
    TagSpecifications: config.tagSpecifications,
    KeyName: config.input.keyPairName
  };

  try {
    const result = await ec2.runInstances(params).promise();
    const ec2InstanceIds = result.Instances.map(i => i.InstanceId);
    core.info(`AWS EC2 instances ${JSON.stringify(ec2InstanceIds)} are started`);
    return ec2InstanceIds;
  } catch (error) {
    core.error('AWS EC2 instance starting error');
    throw error;
  }
}

async function terminateEc2Instances() {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: config.input.ec2InstanceIds,
  };

  try {
    await ec2.terminateInstances(params).promise();
    core.info(`AWS EC2 instances ${JSON.stringify(config.input.ec2InstanceIds)} are terminated`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances ${JSON.stringify(config.input.ec2InstanceIds)} termination error`);
    throw error;
  }
}

async function waitForInstancesRunning(ec2InstanceIds) {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: ec2InstanceIds,
  };

  try {
    await ec2.waitFor('instanceRunning', params).promise();
    core.info(`AWS EC2 instances ${JSON.stringify(ec2InstanceIds)} are up and running`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances ${JSON.stringify(ec2InstanceIds)} initialization error`);
    throw error;
  }
}

module.exports = {
  startEc2Instances,
  terminateEc2Instances,
  waitForInstancesRunning,
};
