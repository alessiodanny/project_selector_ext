import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Project {
  name: string;
  path: string;
  icon?: string;
  color?: string;
  iconColor?: string;
  description?: string;
}

const MATERIAL_ICONS = [
  'folder', 'code', 'web', 'android', 'phone_android', 'computer', 'laptop',
  'storage', 'cloud', 'school', 'work', 'business', 'home', 'star', 'favorite',
  'extension', 'build', 'science', 'psychology', 'psychology_alt', 'architecture',
  'brush', 'palette', 'music_note', 'movie', 'sports_esports', 'sports_soccer',
  'fitness_center', 'restaurant', 'local_cafe', 'local_bar', 'shopping_cart',
  'shopping_bag', 'local_mall', 'local_grocery_store', 'local_pharmacy',
  'local_hospital', 'local_library', 'local_park', 'local_airport', 'local_taxi'
];

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
    return project.icon || 'folder';
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
        case 'reorder':
          this.reorderProjects(message.projects);
          break;
        case 'updateIcon':
          await this.updateProjectIcon(message.project, message.icon, message.iconColor);
          break;
        case 'updateColor':
          await this.updateProjectColor(message.project, message.color, message.isIconColor);
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
          color: this.getRandomColor(projectName),
          icon: 'folder'
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

  private async updateProjectIcon(projectName: string, icon: string, iconColor?: string) {
    const project = this._projects.find(p => p.name === projectName);
    if (project) {
      project.icon = icon;
      if (iconColor) {
        project.iconColor = iconColor;
      }
      this.saveProjects();
      this._view?.webview.postMessage({ 
        command: 'setProjects', 
        projects: this._projects 
      });
    }
  }

  private async updateProjectColor(projectName: string, color: string, isIconColor: boolean = false) {
    const project = this._projects.find(p => p.name === projectName);
    if (project) {
      if (isIconColor) {
        project.iconColor = color;
      } else {
        project.color = color;
      }
      this.saveProjects();
      this._view?.webview.postMessage({ 
        command: 'setProjects', 
        projects: this._projects 
      });
    }
  }

  private reorderProjects(newOrder: Project[]) {
    this._projects = newOrder;
    this.saveProjects();
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
      user-select: none;
    }
    .project-item:hover {
      background: var(--vscode-list-hoverBackground);
      transform: translateX(2px);
    }
    .project-item.dragging {
      opacity: 0.5;
      background: var(--vscode-list-activeSelectionBackground);
    }
    .project-item.drag-over {
      border-top: 2px solid var(--vscode-button-background);
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
      cursor: pointer;
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
    .icon-picker {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      z-index: 1000;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      display: none;
    }
    .icon-picker.visible {
      display: block;
    }
    .icon-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
      padding: 10px;
    }
    .icon-option {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
      color: var(--vscode-foreground);
    }
    .icon-option:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .color-picker {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      z-index: 1000;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      display: none;
      min-width: 300px;
    }
    .color-picker.visible {
      display: block;
    }
    .color-picker-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .color-picker-title {
      font-size: 14px;
      font-weight: 500;
    }
    .color-picker-close {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }
    .color-picker-close:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .color-picker-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }
    .color-picker-tab {
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .color-picker-tab.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .color-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      padding: 10px;
    }
    .color-option {
      width: 32px;
      height: 32px;
      border-radius: 4px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: transform 0.2s;
    }
    .color-option:hover {
      transform: scale(1.1);
      border-color: var(--vscode-foreground);
    }
    .color-picker-footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .color-picker-button {
      padding: 6px 12px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      margin-left: 8px;
    }
    .color-picker-button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .color-picker-button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .color-picker-button:hover {
      opacity: 0.9;
    }
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: none;
      z-index: 999;
    }
    .overlay.visible {
      display: block;
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

  <div id="overlay" class="overlay"></div>
  
  <div id="iconPicker" class="icon-picker">
    <div class="icon-grid">
      ${MATERIAL_ICONS.map(icon => `
        <div class="icon-option" data-icon="${icon}">
          <span class="material-icons">${icon}</span>
        </div>
      `).join('')}
    </div>
  </div>

  <div id="colorPicker" class="color-picker">
    <div class="color-picker-header">
      <div class="color-picker-title">Seleziona Colore</div>
      <button class="color-picker-close" onclick="hidePickers()">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="color-picker-tabs">
      <div class="color-picker-tab active" data-tab="background">Sfondo</div>
      <div class="color-picker-tab" data-tab="icon">Icona</div>
    </div>
    <div class="color-grid">
      ${[
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
        '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
        '#E67E22', '#2ECC71', '#1ABC9C', '#F1C40F',
        '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
        '#FF00FF', '#00FFFF', '#000000', '#FFFFFF',
        '#808080', '#800000', '#808000', '#008000',
        '#800080', '#008080', '#000080', '#FFA500',
        '#A52A2A', '#DEB887', '#5F9EA0', '#7FFF00'
      ].map(color => `
        <div class="color-option" style="background-color: ${color}" data-color="${color}"></div>
      `).join('')}
    </div>
    <div class="color-picker-footer">
      <button class="color-picker-button secondary" onclick="hidePickers()">Annulla</button>
      <button class="color-picker-button primary" onclick="applyColor()">Applica</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const projectList = document.getElementById('projectList');
    const addButton = document.getElementById('addProjectButton');
    const iconPicker = document.getElementById('iconPicker');
    const colorPicker = document.getElementById('colorPicker');
    const overlay = document.getElementById('overlay');
    let currentProject = null;
    let currentColor = null;
    let isIconColor = false;

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

    function showIconPicker(project) {
      currentProject = project;
      iconPicker.classList.add('visible');
      overlay.classList.add('visible');
    }

    function showColorPicker(project, isIcon = false) {
      currentProject = project;
      isIconColor = isIcon;
      colorPicker.classList.add('visible');
      overlay.classList.add('visible');
      
      // Aggiorna il tab attivo
      document.querySelectorAll('.color-picker-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-tab') === (isIcon ? 'icon' : 'background'));
      });
    }

    function hidePickers() {
      iconPicker.classList.remove('visible');
      colorPicker.classList.remove('visible');
      overlay.classList.remove('visible');
      currentProject = null;
      currentColor = null;
      isIconColor = false;
    }

    overlay.addEventListener('click', hidePickers);

    document.querySelectorAll('.icon-option').forEach(option => {
      option.addEventListener('click', () => {
        if (currentProject) {
          const icon = option.getAttribute('data-icon');
          vscode.postMessage({ 
            command: 'updateIcon', 
            project: currentProject, 
            icon: icon 
          });
          hidePickers();
        }
      });
    });

    document.querySelectorAll('.color-picker-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.color-picker-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        isIconColor = tab.getAttribute('data-tab') === 'icon';
      });
    });

    document.querySelectorAll('.color-option').forEach(option => {
      option.addEventListener('click', () => {
        currentColor = option.getAttribute('data-color');
        document.querySelectorAll('.color-option').forEach(opt => 
          opt.style.border = '2px solid transparent'
        );
        option.style.border = '2px solid var(--vscode-foreground)';
      });
    });

    function applyColor() {
      if (currentProject && currentColor) {
        vscode.postMessage({ 
          command: 'updateColor', 
          project: currentProject, 
          color: currentColor,
          isIconColor: isIconColor
        });
        hidePickers();
      }
    }

    function updateProjectList(projects) {
      if (projects.length === 0) {
        projectList.innerHTML = '<div class="empty-state">Nessun progetto aggiunto</div>';
        return;
      }

      projectList.innerHTML = projects.map(project => \`
        <div class="project-item" data-project="\${project.name}" draggable="true">
          <div class="project-icon" style="background-color: \${project.color || getRandomColor(project.name)}" 
               onclick="showIconPicker('\${project.name}')" 
               oncontextmenu="showColorPicker('\${project.name}', false); return false;">
            <span class="material-icons" style="color: \${project.iconColor || '#FFFFFF'}">\${project.icon || 'folder'}</span>
          </div>
          <div class="project-content">
            <div class="project-name">\${project.name}</div>
            <div class="project-description">\${project.description || 'Nessuna descrizione'}</div>
          </div>
          <div class="project-actions">
            <button class="action-button edit-button" title="Modifica progetto">
              <span class="material-icons">edit</span>
            </button>
            <button class="action-button" title="Cambia colore icona" onclick="showColorPicker('\${project.name}', true)">
              <span class="material-icons">palette</span>
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
          if (!e.target.closest('.action-button') && !e.target.closest('.project-icon')) {
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

        // Drag and drop
        item.addEventListener('dragstart', (e) => {
          item.classList.add('dragging');
          e.dataTransfer.setData('text/plain', projectName);
        });

        item.addEventListener('dragend', () => {
          item.classList.remove('dragging');
        });

        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          const draggingItem = document.querySelector('.dragging');
          if (draggingItem !== item) {
            item.classList.add('drag-over');
          }
        });

        item.addEventListener('dragleave', () => {
          item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
          e.preventDefault();
          item.classList.remove('drag-over');
          const draggedProject = e.dataTransfer.getData('text/plain');
          const projects = Array.from(document.querySelectorAll('.project-item'))
            .map(item => item.getAttribute('data-project'));
          vscode.postMessage({ 
            command: 'reorder', 
            projects: projects 
          });
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