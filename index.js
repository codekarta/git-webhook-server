const express = require("express")
const { exec } = require("child_process")

const app = express()
const PORT = 3000 // The port your webhook server will run on

app.use(express.json())

app.get("/", (req, res) => {
  res.send("Hello World!")
})

app.get("/deploy", (req, res) => {
  const secret = req.headers["x-webhook-secret"]
  const github_token = req.headers["x-github-token"]
  const github_repo = req.headers["x-github-repo"]
  const github_branch = req.headers["x-github-branch"]

  const user = github_repo.split("/")[1]

  if (secret !== "238362fabd29a2b4b346dcf1711f121de54f3d763d9603d18afd24d6f0c075b9") {
    res.status(403).send("Forbidden")
  }

  const appDir = `/home/${user}/app/${github_branch}` // Replace with the actual path to the user's app directory

  const checkIfGitRepo = `
    sudo -u ${user} bash <<'EOF'
    isGitRepo=false;
    if [ -d "${appDir}" ]; then
      cd ${appDir}
      if [ -d ".git" ]; then
        echo "repo already exists"
      fi'    
    fi'
    if [ "$isGitRepo" = "false" ]; then
      mkdir -p ${appDir}
      cd ${appDir}
      git clone https://${github_token}@github.com/${github_repo}.git .
    fi
    EOF`

  const checkout = `
    sudo -u ${user} bash
    cd ${appDir} &&
    git pull &&
    git checkout ${github_branch} &&
    npm install &&
  `

  const stopPM2 = `pm2 stop all`
  const build = `npm run build`
  const startPM2 = `pm2 start all`

  runCommand(checkIfGitRepo, res, user)
  runCommand(checkout, res, user)
  // runCommand(stopPM2, res, user)
  // runCommand(build, res, user)
  // runCommand(startPM2, res, user)

  res.send(`Deployment successful for user ${user}!`)
})

app.listen(PORT, () => {
  console.log(`Webhook listener running on port ${PORT}`)
})

function runCommand(command, res, user) {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Exec error: ${error}`)
      return res
        .status(500)
        .send(`Error deploying the application for user ${user}`)
    }

    console.log(`Deployment output for user ${user}: ${stdout}`)
    if (stderr) {
      console.error(`Deployment error output for user ${user}: ${stderr}`)
      return res
        .status(500)
        .send(`Error deploying the application for user ${user}`)
    }
  })
}
