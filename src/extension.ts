import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Project {
  name: string;
  path: string;
  icon?: string;
  color?: string;
  description?: string;
}

export function activate(context: vscode.ExtensionContext) {
  try {
    const provider = new ProjectSidebarProvider(context.extensionUri, context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('projectSwitcher.projectView', provider)
    );
  } catch (error) {
    console.error('Failed to activate extension:', error);
    vscode.window.showErrorMessage('Failed to activate Project Switcher extension');
  }
}

class ProjectSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _projects: Project[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {
    this.loadProjects();
  }

  private loadProjects() {
    const projectsJson = this._context.globalState.get<string>('projects');
    if (projectsJson) {
      this._projects = JSON.parse(projectsJson);
    }
  }

  private saveProjects() {
    this._context.globalState.update('projects', JSON.stringify(this._projects));
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  private getRandomColor(name: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
      '#E67E22', '#2ECC71', '#1ABC9C', '#F1C40F'
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  }

  private getProjectIcon(project: Project): string {
    if (project.icon) {
      return project.icon;
    }
    return 'folder';
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'switch':
          await this.switchProject(message.project);
          break;
        case 'add':
          await this.addProject();
          break;
        case 'edit':
          await this.editProject(message.project);
          break;
        case 'delete':
          await this.deleteProject(message.project);
          break;
        case 'getProjects':
          this._view?.webview.postMessage({ 
            command: 'setProjects', 
            projects: this._projects 
          });
          break;
      }
    });
  }

  private async addProject() {
    const folderUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Seleziona Cartella Progetto'
    });

    if (folderUri && folderUri[0]) {
      const projectName = await vscode.window.showInputBox({
        prompt: 'Inserisci il nome del progetto',
        placeHolder: 'Nome Progetto'
      });

      if (projectName) {
        const description = await vscode.window.showInputBox({
          prompt: 'Inserisci una descrizione (opzionale)',
          placeHolder: 'Descrizione del progetto'
        });

        const project: Project = {
          name: projectName,
          path: folderUri[0].fsPath,
          description: description || undefined,
          color: this.getRandomColor(projectName)
        };

        this._projects.push(project);
        this.saveProjects();
        this._view?.webview.postMessage({ 
          command: 'setProjects', 
          projects: this._projects 
        });
      }
    }
  }

  private async editProject(projectName: string) {
    const project = this._projects.find(p => p.name === projectName);
    if (project) {
      const newName = await vscode.window.showInputBox({
        prompt: 'Modifica il nome del progetto',
        value: project.name
      });

      if (newName) {
        const newDescription = await vscode.window.showInputBox({
          prompt: 'Modifica la descrizione',
          value: project.description || ''
        });

        project.name = newName;
        project.description = newDescription || undefined;
        this.saveProjects();
        this._view?.webview.postMessage({ 
          command: 'setProjects', 
          projects: this._projects 
        });
      }
    }
  }

  private async deleteProject(projectName: string) {
    const project = this._projects.find(p => p.name === projectName);
    if (project) {
      const confirm = await vscode.window.showWarningMessage(
        `Sei sicuro di voler eliminare il progetto "${projectName}"?`,
        { modal: true },
        'Sì',
        'No'
      );

      if (confirm === 'Sì') {
        this._projects = this._projects.filter(p => p.name !== projectName);
        this.saveProjects();
        this._view?.webview.postMessage({ 
          command: 'setProjects', 
          projects: this._projects 
        });
      }
    }
  }

  private async switchProject(projectName: string) {
    const project = this._projects.find(p => p.name === projectName);
    if (project) {
      try {
        const uri = vscode.Uri.file(project.path);
        await vscode.commands.executeCommand('vscode.openFolder', uri);
        vscode.window.showInformationMessage(`Progetto selezionato: ${project.name}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Errore nell'apertura del progetto: ${error}`);
      }
    }
  }

  getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
  <style>
    body {
      padding: 10px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
    .container {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .title {
      font-size: 1.2em;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin: 0;
    }
    .project-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .project-item {
      display: flex;
      align-items: center;
      padding: 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      color: var(--vscode-foreground);
      background: var(--vscode-list-inactiveSelectionBackground);
    }
    .project-item:hover {
      background: var(--vscode-list-hoverBackground);
      transform: translateX(2px);
    }
    .project-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      color: white;
      font-size: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .project-content {
      flex: 1;
      min-width: 0;
    }
    .project-name {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .project-description {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .project-actions {
      display: flex;
      gap: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .project-item:hover .project-actions {
      opacity: 1;
    }
    .action-button {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .action-button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .add-button {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .add-button:hover {
      background: var(--vscode-button-hoverBackground);
      transform: translateY(-1px);
    }
    .add-button .material-icons {
      margin-right: 6px;
      font-size: 18px;
    }
    .empty-state {
      text-align: center;
      padding: 30px 20px;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      background: var(--vscode-list-inactiveSelectionBackground);
      border-radius: 8px;
    }
    .material-icons {
      font-size: 18px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h3 class="title">Progetti</h3>
    </div>
    <div id="projectList" class="project-list">
      <div class="empty-state">Nessun progetto aggiunto</div>
    </div>
    <button id="addProjectButton" class="add-button">
      <span class="material-icons">add</span>
      Aggiungi Progetto
    </button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const projectList = document.getElementById('projectList');
    const addButton = document.getElementById('addProjectButton');

    function getInitials(name) {
      return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    }

    function getRandomColor(name) {
      const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
        '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
        '#E67E22', '#2ECC71', '#1ABC9C', '#F1C40F'
      ];
      const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return colors[index % colors.length];
    }

    function updateProjectList(projects) {
      if (projects.length === 0) {
        projectList.innerHTML = '<div class="empty-state">Nessun progetto aggiunto</div>';
        return;
      }

      projectList.innerHTML = projects.map(project => \`
        <div class="project-item" data-project="\${project.name}">
          <div class="project-icon" style="background-color: \${project.color || getRandomColor(project.name)}">
            <span class="material-icons">folder</span>
          </div>
          <div class="project-content">
            <div class="project-name">\${project.name}</div>
            <div class="project-description">\${project.description || 'Nessuna descrizione'}</div>
          </div>
          <div class="project-actions">
            <button class="action-button edit-button" title="Modifica progetto">
              <span class="material-icons">edit</span>
            </button>
            <button class="action-button delete-button" title="Elimina progetto">
              <span class="material-icons">delete</span>
            </button>
          </div>
        </div>
      \`).join('');

      // Aggiungi event listeners
      document.querySelectorAll('.project-item').forEach(item => {
        const projectName = item.getAttribute('data-project');
        
        // Click sul progetto
        item.addEventListener('click', (e) => {
          if (!e.target.closest('.action-button')) {
            vscode.postMessage({ command: 'switch', project: projectName });
          }
        });

        // Click sul pulsante modifica
        item.querySelector('.edit-button').addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ command: 'edit', project: projectName });
        });

        // Click sul pulsante elimina
        item.querySelector('.delete-button').addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ command: 'delete', project: projectName });
        });
      });
    }

    // Richiedi la lista dei progetti all'attivazione
    vscode.postMessage({ command: 'getProjects' });

    // Gestisci i messaggi dall'estensione
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'setProjects':
          updateProjectList(message.projects);
          break;
      }
    });

    addButton.addEventListener('click', () => {
      vscode.postMessage({ command: 'add' });
    });
  </script>
</body>
</html>`;
  }
}