import * as vscode from 'vscode';

let statusBarItems: vscode.StatusBarItem[] = [];
let registeredCommands: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {
  function createButtons() {
    // Dispose existing items
    statusBarItems.forEach((item) => item.dispose());
    registeredCommands.forEach((cmd) => cmd.dispose());
    statusBarItems = [];
    registeredCommands = [];

    // Retrieve stored buttons from globalState
    const commands = context.globalState.get<any[]>('customCommandButtons') || [];

    commands.forEach((cmdConfig, index) => {
      const commandId = `customCommandButtons.command${index}`;

      // Register the command
      const command = vscode.commands.registerCommand(commandId, () => {
        try {
          const terminalName = cmdConfig.terminalName || `Terminal ${index + 1}`;
          const terminal = vscode.window.createTerminal(terminalName);
          terminal.show();

          // Replace variables in command if needed
          let commandToExecute = cmdConfig.command;
          if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
            commandToExecute = commandToExecute.replace(/\${workspaceFolder}/g, workspaceFolder);
          }

          terminal.sendText(commandToExecute);
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to execute command: ${error.message}`);
        }
      });
      context.subscriptions.push(command);
      registeredCommands.push(command);

      // Create the status bar item without icons
      const alignment =
        cmdConfig.alignment === 'right'
          ? vscode.StatusBarAlignment.Right
          : vscode.StatusBarAlignment.Left;
      const priority = cmdConfig.priority || 0;
      const statusBarItem = vscode.window.createStatusBarItem(alignment, priority);
      statusBarItem.command = commandId;
      statusBarItem.text = cmdConfig.text; // Icons are excluded here
      statusBarItem.tooltip = cmdConfig.tooltip || cmdConfig.text;
      if (cmdConfig.color) {
        statusBarItem.color = cmdConfig.color;
      }
      statusBarItem.show();
      context.subscriptions.push(statusBarItem);
      statusBarItems.push(statusBarItem);
    });
  }

  createButtons();

  // Register the command to open the GUI
  const manageButtonsCommand = vscode.commands.registerCommand('customCommandButtons.manageButtons', () => {
    openManageButtonsWebview(context, createButtons);
  });
  context.subscriptions.push(manageButtonsCommand);
}

function openManageButtonsWebview(context: vscode.ExtensionContext, refreshButtons: () => void) {
  const panel = vscode.window.createWebviewPanel('manageButtons', 'Manage Custom Buttons', vscode.ViewColumn.One, {
    enableScripts: true,
  });

  // Get existing commands
  const commands = context.globalState.get<any[]>('customCommandButtons') || [];

  // Convert commands to JSON string
  const commandsJson = JSON.stringify(commands);

  // Set the HTML content for the Webview
  panel.webview.html = getWebviewContent(commandsJson);

  // Handle messages from the Webview
  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.command) {
        case 'saveCommands':
          // Save the updated commands to globalState
          context.globalState.update('customCommandButtons', message.commands);
          vscode.window.showInformationMessage('Custom buttons updated!');
          // Refresh the status bar buttons
          refreshButtons();
          return;
      }
    },
    undefined,
    context.subscriptions
  );
}

function getWebviewContent(commandsJson: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Manage Custom Buttons</title>
      <style>
        body { font-family: sans-serif; padding: 10px; }
        .button-container { border: 1px solid #ccc; padding: 10px; margin-bottom: 10px; }
        input[type="text"], input[type="number"], select { width: calc(100% - 10px); padding: 5px; margin-bottom: 5px; }
        label { display: block; margin-bottom: 5px; }
        .actions { margin-top: 10px; }
        button { padding: 5px 10px; margin-right: 5px; }
      </style>
    </head>
    <body>
      <h1>Manage Custom Buttons</h1>
      <div id="buttons-container"></div>
      <div class="actions">
        <button id="add-button">Add Button</button>
        <button id="save-button">Save Changes</button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        let commands = ${commandsJson};

        function renderButtons() {
          const container = document.getElementById('buttons-container');
          container.innerHTML = '';
          commands.forEach((cmd, index) => {
            const div = document.createElement('div');
            div.className = 'button-container';
            div.innerHTML = \`
              <h3>Button \${index + 1}</h3>
              <label>Text: <input type="text" data-index="\${index}" data-field="text" value="\${cmd.text}" /></label>
              <label>Tooltip: <input type="text" data-index="\${index}" data-field="tooltip" value="\${cmd.tooltip || ''}" /></label>
              <label>Command: <input type="text" data-index="\${index}" data-field="command" value="\${cmd.command}" /></label>
              <label>Color: <input type="color" data-index="\${index}" data-field="color" value="\${cmd.color || '#ffffff'}" /></label>
              <label>Alignment:
                <select data-index="\${index}" data-field="alignment">
                  <option value="left"\${cmd.alignment === 'left' ? ' selected' : ''}>Left</option>
                  <option value="right"\${cmd.alignment === 'right' ? ' selected' : ''}>Right</option>
                </select>
              </label>
              <label>Priority: <input type="number" data-index="\${index}" data-field="priority" value="\${cmd.priority || 0}" /></label>
              <label>Terminal Name: <input type="text" data-index="\${index}" data-field="terminalName" value="\${cmd.terminalName || ''}" /></label>
              <button data-index="\${index}" class="delete-button">Delete</button>
            \`;
            container.appendChild(div);
          });
        }

        document.getElementById('add-button').addEventListener('click', () => {
          commands.push({
            text: '',
            command: ''
          });
          renderButtons();
        });

        document.getElementById('save-button').addEventListener('click', () => {
          vscode.postMessage({
            command: 'saveCommands',
            commands: commands
          });
        });

        document.getElementById('buttons-container').addEventListener('input', (event) => {
          const target = event.target;
          const index = target.getAttribute('data-index');
          const field = target.getAttribute('data-field');
          if (field && index !== null) {
            commands[index][field] = target.value;
          }
        });

        document.getElementById('buttons-container').addEventListener('click', (event) => {
          if (event.target.classList.contains('delete-button')) {
            const index = event.target.getAttribute('data-index');
            commands.splice(index, 1);
            renderButtons();
          }
        });

        // Initial render
        renderButtons();
      </script>
    </body>
    </html>
  `;
}

export function deactivate() {
  // Dispose all status bar items and commands
  statusBarItems.forEach((item) => item.dispose());
  registeredCommands.forEach((cmd) => cmd.dispose());
}
