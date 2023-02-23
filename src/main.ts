import {App, Notice, Plugin, PluginSettingTab, Setting, TextComponent} from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';


interface ThemeHotReloadSettings {
	fileWatchers: FileWatcherData[];
	fileWatcherInterval: number;
}

const DEFAULT_SETTINGS: ThemeHotReloadSettings = {
	fileWatchers: [],
	fileWatcherInterval: 200,
};

export default class ThemeHotReload extends Plugin {
	settings: ThemeHotReloadSettings;
	fileWatchers: FileWatcher[];

	async onload() {
		await this.loadSettings();
		this.fileWatchers = [];
		for (const fileWatcherData of this.settings.fileWatchers) {
			this.loadFileWatcher(fileWatcherData);
		}

		this.addCommand({
			id: 'reload-css',
			name: 'Reload CSS',
			callback: () => {
				for (const csscacheElement of this.getCSSCache().keys()) {
					this.reloadCSSFile(csscacheElement);
				}
			},
		});

		this.addCommand({
			id: 'restart-file-watchers',
			name: 'Restart File Watchers',
			callback: () => {
				this.restartFileWatchers();
			},
		});

		this.app.workspace.on('css-change', () => {
			// console.trace('css change event')
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ThemeHotReloadSettingsTab(this.app, this));
	}

	onunload() {
		for (const fileWatcher of this.fileWatchers) {
			fileWatcher.disable();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async reloadCSSFile(filePath: string): Promise<void> {
		const content = await this.app.vault.adapter.read(filePath);

		// @ts-ignore
		this.getCSSCache().set(filePath, content);
		// @ts-ignore
		this.app.customCss.requestLoadTheme();

		let message = `Reloaded css file ${filePath}`

		console.debug(`Theme Hot-Reload | ${message}`);
	}

	getCSSCache(): Map<string, string> {
		// @ts-ignore
		return this.app.customCss.csscache as Map<string, string>;
	}

	addFileWatcher(filePath: string): void {
		const watcherData: FileWatcherData = {
			file: filePath,
			active: true,
		};

		for (const fileWatcher of this.settings.fileWatchers) {
			if (fileWatcher.file === watcherData.file) {
				let message = `File watcher for that file already exists`;
				new Notice(`Theme Hot-Reload Error\n${message}`);
				console.warn(`Theme Hot-Reload | ${message}`)
				return;
			}
		}

		if (this.loadFileWatcher(watcherData)) {
			this.settings.fileWatchers.push(watcherData);
			this.saveSettings();
		}
	}

	removeFileWatcher(watcherData: FileWatcherData): void {
		this.deactivateFileWatcher(watcherData);

		this.settings.fileWatchers = this.settings.fileWatchers.filter(x => x.file !== watcherData.file);
		this.fileWatchers = this.fileWatchers.filter(x => x.data.file !== watcherData.file);

		this.saveSettings();
	}

	activateFileWatcher(watcherData: FileWatcherData): void {
		for (const fileWatcher of this.settings.fileWatchers) {
			if (fileWatcher.file === watcherData.file) {
				fileWatcher.active = true;
			}
		}

		for (const fileWatcher of this.fileWatchers) {
			if (fileWatcher.data.file === watcherData.file) {
				fileWatcher.enable();
			}
		}

		this.saveSettings();
	}


	deactivateFileWatcher(watcherData: FileWatcherData): void {
		for (const fileWatcher of this.settings.fileWatchers) {
			if (fileWatcher.file === watcherData.file) {
				fileWatcher.active = false;
			}
		}

		for (const fileWatcher of this.fileWatchers) {
			if (fileWatcher.data.file === watcherData.file) {
				fileWatcher.disable();
			}
		}

		this.saveSettings();
	}


	loadFileWatcher(watcherData: FileWatcherData): boolean {
		try {
			let message = `Loading file watcher for ${watcherData.file}`;
			console.log(`Theme Hot-Reload | ${message}`);

			const fileWatcher = new FileWatcher(watcherData, () => this.reloadCSSFile(watcherData.file));

			if (watcherData.active) {
				fileWatcher.enable();
			}

			this.fileWatchers.push(fileWatcher);

			return true;
		} catch (e) {
			new Notice(`error while loading file watcher ${e.toString()}`);
			return false;
		}
	}

	restartFileWatchers(): void {
		let message = `Restarting all file watchers.`
		console.log(`Theme Hot-Reload | ${message}`);

		for (const fileWatcher of this.fileWatchers) {
			fileWatcher.disable();
		}

		this.fileWatchers = [];
		for (const fileWatcherData of this.settings.fileWatchers) {
			this.loadFileWatcher(fileWatcherData);
		}

		let message1 = `Restarted all file watchers.`
		new Notice(`Theme Hot-Reload\n${message1}`);
	}
}

interface FileWatcherData {
	file: string;
	active: boolean;
}

class FileWatcher {
	data: FileWatcherData;
	fullPath: string;
	onFileUpdate: () => void;

	constructor(data: FileWatcherData, onFileUpdate: () => void) {
		this.data = data;
		this.onFileUpdate = onFileUpdate;
		this.fullPath = path.join(getVaultBasePath(), data.file);

		if (!fs.existsSync(this.fullPath)) {
			throw new Error('file does not exist');
		}

		if (!fs.lstatSync(this.fullPath).isFile()) {
			throw new Error('filepath must point to a file');
		}
	}

	enable(): void {
		fs.watchFile(this.fullPath, {interval: 200}, () => this.onFileUpdate());

		let message = `Activated file watcher for ${this.fullPath}`;

		console.debug(`Theme Hot-Reload | ${message}`);
	}

	disable(): void {
		fs.unwatchFile(this.fullPath);

		let message = `Deactivated file watcher for ${this.fullPath}`;

		console.debug(`Theme Hot-Reload | ${message}`);
	}
}


class ThemeHotReloadSettingsTab extends PluginSettingTab {
	plugin: ThemeHotReload;

	addWatcherText: string;

	constructor(app: App, plugin: ThemeHotReload) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h1', {text: 'Theme Hot-Reload'});
		containerEl.createEl('h2', {text: 'File Watchers'});


		const restartWatcherSet = new Setting(containerEl);
		restartWatcherSet.setName('Restart File Watchers');
		restartWatcherSet.addButton((button) => {
			button.buttonEl.textContent = 'Restart';
			button.setWarning();
			button.onClick(() => {
				this.plugin.restartFileWatchers();
				this.display();
			})
		});

		const intervalDescFragment = document.createDocumentFragment();
		intervalDescFragment.appendText('Interval in ms between checks by the file watcher.');
		intervalDescFragment.createEl('br');
		intervalDescFragment.createEl('strong', {text: 'File watchers need to be restarted using the setting above for this to take effect.'});
		intervalDescFragment.createEl('br');
		intervalDescFragment.createEl('strong', {text: 'Default: '});
		intervalDescFragment.appendText('200');
		intervalDescFragment.createEl('br');
		intervalDescFragment.createEl('strong', {text: 'Min: '});
		intervalDescFragment.appendText('100');
		intervalDescFragment.createEl('br');
		intervalDescFragment.createEl('strong', {text: 'Max: '});
		intervalDescFragment.appendText('10000');

		const intervalWatcherSet = new Setting(containerEl);
		intervalWatcherSet.setName('File Watcher Interval');
		intervalWatcherSet.setDesc(intervalDescFragment)
		intervalWatcherSet.addText((text) => {
			text.inputEl.type = 'number';
			text.setValue(this.plugin.settings.fileWatcherInterval.toString());
			text.onChange((value) => {
				let number = Number.parseInt(value);
				if (Number.isNaN(number) || number < 100 || number > 10000) {
					number = DEFAULT_SETTINGS.fileWatcherInterval;
				}
				this.plugin.settings.fileWatcherInterval = number;
				this.plugin.saveSettings();
			})
		});

		const addWatcherSet = new Setting(containerEl);
		let addWatcherSetTextComponent: TextComponent;
		addWatcherSet.setName('Add File Watcher');
		addWatcherSet.addText((text) => {
			text.setValue(this.addWatcherText);
			text.onChange((value) => this.addWatcherText = value);
			addWatcherSetTextComponent = text;
		});
		addWatcherSet.addButton((button) => {
			button.setCta();
			button.setIcon('plus');
			button.setTooltip('Add');
			button.onClick(async () => {
				await this.plugin.addFileWatcher(this.addWatcherText);
				this.addWatcherText = '';
				addWatcherSetTextComponent.setValue(this.addWatcherText);
				this.display();
			});
		});

		const div = containerEl.createDiv({cls: 'theme-hot-reload-file-watcher-container'});

		for (const fileWatcher of this.plugin.fileWatchers) {
			const watcherSetting = fileWatcher.data;

			const descFragment = document.createDocumentFragment();
			descFragment.createEl('strong', {text: 'Full Path: '});
			descFragment.appendText(fileWatcher.fullPath);

			const set = new Setting(div);
			set.setName(watcherSetting.file);
			set.setDesc(descFragment);

			set.addToggle((toggle) => {
				toggle.setTooltip('Active');
				toggle.setValue(watcherSetting.active);
				toggle.onChange((value) => {
					if (value) {
						this.plugin.activateFileWatcher(watcherSetting);
					} else {
						this.plugin.deactivateFileWatcher(watcherSetting);
					}
					this.display();
				});
			});

			set.addButton((button) => {
				button.setWarning();
				button.setIcon('trash');
				button.setTooltip('Delete');
				button.onClick(() => {
					this.plugin.removeFileWatcher(watcherSetting);
					this.display();
				});
			});
		}
	}
}

function getVaultBasePath(): string {
	// @ts-ignore undocumented but works
	return app.vault.adapter.getBasePath();
}
