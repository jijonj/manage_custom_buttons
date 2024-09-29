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
    const buttons = context.globalState.get<any[]>('customCommandButtons') || [];

    buttons.forEach((buttonConfig, index) => {
      const commandId = `customCommandButtons.button${index}`;

      // Register the command
      const command = vscode.commands.registerCommand(commandId, async () => {
        try {
          const selected = await vscode.window.showQuickPick(
            buttonConfig.commands.map((cmd: any) => cmd.label),
            { placeHolder: 'Select a command to execute' }
          );

          if (selected) {
            const cmd = buttonConfig.commands.find((c: any) => c.label === selected);
            if (cmd) {
              const terminalName = cmd.terminalName || `Terminal ${index + 1}`;
              const terminal = vscode.window.createTerminal(terminalName);
              terminal.show();

              // Replace variables in command if needed
              let commandToExecute = cmd.command;
              if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
                commandToExecute = commandToExecute.replace(/\${workspaceFolder}/g, workspaceFolder);
              }

              terminal.sendText(commandToExecute);
            }
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to execute command: ${error.message}`);
        }
      });
      context.subscriptions.push(command);
      registeredCommands.push(command);

      // Create the status bar item
      const alignment =
        buttonConfig.alignment === 'right'
          ? vscode.StatusBarAlignment.Right
          : vscode.StatusBarAlignment.Left;
      const priority = buttonConfig.priority || 0;
      const statusBarItem = vscode.window.createStatusBarItem(alignment, priority);
      statusBarItem.command = commandId;
      statusBarItem.text = buttonConfig.text;
      statusBarItem.tooltip = buttonConfig.tooltip || buttonConfig.text;
      if (buttonConfig.color) {
        statusBarItem.color = buttonConfig.color;
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

  // Get existing buttons
  const buttons = context.globalState.get<any[]>('customCommandButtons') || [];

  // Convert buttons to JSON string
  const buttonsJson = JSON.stringify(buttons);

  // Set the HTML content for the Webview
  panel.webview.html = getWebviewContent(buttonsJson);

  // Handle messages from the Webview
  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.command) {
        case 'saveCommands':
          // Save the updated buttons to globalState
          context.globalState.update('customCommandButtons', message.buttons);
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

function getWebviewContent(buttonsJson: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Manage Custom Buttons</title>
      <style>
        body { font-family: sans-serif; padding: 10px; }
        .button-container { border: 1px solid #ccc; padding: 10px; margin-bottom: 10px; }
        .command-item { border: 1px solid #aaa; padding: 5px; margin-bottom: 5px; }
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
        let buttons = ${buttonsJson};

        function renderButtons() {
          const container = document.getElementById('buttons-container');
          container.innerHTML = '';
          buttons.forEach((button, index) => {
            const div = document.createElement('div');
            div.className = 'button-container';
            div.innerHTML = \`
              <h3>Button \${index + 1}</h3>
              <label>Text: <input type="text" data-index="\${index}" data-field="text" value="\${button.text}" /></label>
              <label>Tooltip: <input type="text" data-index="\${index}" data-field="tooltip" value="\${button.tooltip || ''}" /></label>
              <label>Alignment:
                <select data-index="\${index}" data-field="alignment">
                  <option value="left"\${button.alignment === 'left' ? ' selected' : ''}>Left</option>
                  <option value="right"\${button.alignment === 'right' ? ' selected' : ''}>Right</option>
                </select>
              </label>
              <label>Priority: <input type="number" data-index="\${index}" data-field="priority" value="\${button.priority || 0}" /></label>
              <label>Color: <input type="color" data-index="\${index}" data-field="color" value="\${button.color || '#ffffff'}" /></label>
              <div class="commands-container" data-index="\${index}">
                <h4>Commands</h4>
                <div class="commands-list">\${renderCommands(button.commands, index)}</div>
                <button data-index="\${index}" class="add-command-button">Add Command</button>
              </div>
              <button data-index="\${index}" class="delete-button">Delete Button</button>
            \`;
            container.appendChild(div);
          });
        }

        function renderCommands(commands, buttonIndex) {
          let html = '';
          commands.forEach((cmd, cmdIndex) => {
            html += \`
              <div class="command-item">
                <label>Label: <input type="text" data-button-index="\${buttonIndex}" data-command-index="\${cmdIndex}" data-field="label" value="\${cmd.label}" /></label>
                <label>Command: <input type="text" data-button-index="\${buttonIndex}" data-command-index="\${cmdIndex}" data-field="command" value="\${cmd.command}" /></label>
                <label>Terminal Name: <input type="text" data-button-index="\${buttonIndex}" data-command-index="\${cmdIndex}" data-field="terminalName" value="\${cmd.terminalName || ''}" /></label>
                <button data-button-index="\${buttonIndex}" data-command-index="\${cmdIndex}" class="delete-command-button">Delete Command</button>
              </div>
            \`;
          });
          return html;
        }

        document.getElementById('add-button').addEventListener('click', () => {
          buttons.push({
            text: '',
            tooltip: '',
            alignment: 'left',
            priority: 0,
            color: '#ffffff',
            commands: []
          });
          renderButtons();
        });

        document.getElementById('save-button').addEventListener('click', () => {
          vscode.postMessage({
            command: 'saveCommands',
            buttons: buttons
          });
        });

        document.getElementById('buttons-container').addEventListener('input', (event) => {
          const target = event.target;
          const index = target.getAttribute('data-index');
          const buttonIndex = target.getAttribute('data-button-index');
          const commandIndex = target.getAttribute('data-command-index');
          const field = target.getAttribute('data-field');

          if (field && index !== null) {
            buttons[index][field] = target.value;
          } else if (field && buttonIndex !== null && commandIndex !== null) {
            buttons[buttonIndex].commands[commandIndex][field] = target.value;
          }
        });

        document.getElementById('buttons-container').addEventListener('click', (event) => {
          if (event.target.classList.contains('add-command-button')) {
            const index = event.target.getAttribute('data-index');
            buttons[index].commands.push({
              label: '',
              command: ''
            });
            renderButtons();
          } else if (event.target.classList.contains('delete-command-button')) {
            const buttonIndex = event.target.getAttribute('data-button-index');
            const commandIndex = event.target.getAttribute('data-command-index');
            buttons[buttonIndex].commands.splice(commandIndex, 1);
            renderButtons();
          } else if (event.target.classList.contains('delete-button')) {
            const index = event.target.getAttribute('data-index');
            buttons.splice(index, 1);
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
