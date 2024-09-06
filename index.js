const express = require("express")
const { exec } = require("child_process")

const app = express()
const PORT = 23001

app.use(express.json())

app.get("/", (req, res) => {
  res.send("Hello World!")
})

app.get("/deploy", (req, res) => {
  const secret = req.headers["x-webhook-secret"]
  const github_token = req.headers["x-github-token"]
  const github_repo = req.headers["x-github-repo"]
  const github_branch = req.headers["x-github-branch"]
  const user = req.headers["x-server-namespace"]

  const repo_name = github_repo.split("/")[1]

  if (
    secret !==
    "238362fabd29a2b4b346dcf1711f121de54f3d763d9603d18afd24d6f0c075b9"
  ) {
    return res.status(403).send("Forbidden")
  }

  const appDir = `/home/${user}/app/${repo_name}/${github_branch}`

  const checkIfGitRepo = `
    sudo -u ${user} bash -c '
    isGitRepo=false
    if [ -d "${appDir}" ]; then
      cd "${appDir}"
      if [ -d ".git" ]; then
        echo "repo already exists"
        isGitRepo=true
      fi
    fi

    if [ "$isGitRepo" = "false" ]; then
      mkdir -p "${appDir}"
      cd "${appDir}"
      git clone https://${github_token}@github.com/${github_repo}.git .
    fi
    '
  `

  const checkout = `
    sudo -u ${user} bash -c '
    cd "${appDir}"
    git pull
    git checkout ${github_branch}
    npm install
    '
  `

  const stopPM2 = `sudo -u ${user} bash -c '
    cd "${appDir}" 
    pm2 start npm --name "${repo_name}_${github_branch}" -- stop
    pm2 delete "${repo_name}_${github_branch}"
  '
  `

  const build = `sudo -u ${user} bash -c '
    cd "${appDir}" 
    npm run build
  '
  `

  const startPM2 = `sudo -u ${user} bash -c '
    cd "${appDir}" 
    nohup pm2 start npm --name "${repo_name}_${github_branch}" -- start
  '
  `

  runCommand(checkIfGitRepo, res, user, () => {
    runCommand(checkout, res, user, () => {
      runCommand(stopPM2, res, user, () => {
        runCommand(build, res, user, () => {
          runCommand(startPM2, res, user, (stdout, stderr) => {
            // Send the output of pm2 start as the response
            if (stderr) {
              console.warn(`Deployment warning for user ${user}: ${stderr}`);
            }
            res.send(`Deployment successful for user ${user}!\nPM2 Output:\n${stdout}`);
          });
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Webhook listener running on port ${PORT}`)
})

function runCommand(command, res, user, callback) {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Exec error: ${error}`)

      // Check for the specific PM2 error about no process found and skip it
      if (stderr.includes("[PM2][WARN] No process found")) {
        console.warn(`PM2 warning skipped for user ${user}: ${stderr}`)
        if (callback) {
          return callback() // Continue with the next step
        }
      } else {
        return res
          .status(500)
          .send(`Error deploying the application for user ${user}: ${stderr}`)
      }
    } else {
      console.log(`Deployment output for user ${user}: ${stdout}`)
      if (stderr) {
        console.warn(`Deployment warning for user ${user}: ${stderr}`)
      }
      if (callback) {
        callback()
      }
    }
  })
}
