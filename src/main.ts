import {App, Notice, Plugin, PluginSettingTab, Setting, TextComponent} from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';


interface ThemeHotReloadSettings {
	fileWatchers: FileWatcherData[];
}

const DEFAULT_SETTINGS: ThemeHotReloadSettings = {
	fileWatchers: [],
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
				const themeFilePath = '.obsidian/themes/LemonsDev.css';

				for (const csscacheElement of this.getCSSCache().keys()) {
					this.reloadCSSFile(csscacheElement);
				}
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

		console.debug('reloaded theme', filePath);
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
				new Notice(`watcher for that file already exists`);
				return;
			}
		}

		if (this.loadFileWatcher(watcherData)) {
			this.settings.fileWatchers.push(watcherData);
		}

		this.saveSettings();
	}

	removeFileWatcher(watcherData: FileWatcherData): void {
		this.disableFileWatcher(watcherData);

		this.settings.fileWatchers = this.settings.fileWatchers.filter(x => x.file !== watcherData.file);
		this.fileWatchers = this.fileWatchers.filter(x => x.data.file !== watcherData.file);

		this.saveSettings();
	}

	enableFileWatcher(watcherData: FileWatcherData): void {
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


	disableFileWatcher(watcherData: FileWatcherData): void {
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
	}

	enable(): void {
		watchFile(this.fullPath, (err) => {
			if (err instanceof Error) {
				throw err;
			}
			console.log('test');
			this.onFileUpdate();
		});
	}

	disable(): void {
		unwatchFile(this.fullPath, (err) => {
			if (err instanceof Error) {
				throw err;
			}
		});
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

		console.log('re-rendered settings tab');

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		const addWatcherSet = new Setting(containerEl);
		let textComponent: TextComponent;
		addWatcherSet.setName('Add File Watcher');
		addWatcherSet.addText((text) => {
			text.setValue(this.addWatcherText);
			text.onChange((value) => this.addWatcherText = value);
			textComponent = text;
		});
		addWatcherSet.addButton((button) => {
			button.setCta();
			button.buttonEl.textContent = 'add';
			button.onClick(() => {
				this.plugin.addFileWatcher(this.addWatcherText);
				this.addWatcherText = '';
				textComponent.setValue(this.addWatcherText);
			});
		});

		containerEl.createEl('h3', {text: 'File Watchers'});

		const div = containerEl.createDiv();

		console.log(this.plugin.settings.fileWatchers);
		console.log(this.plugin.fileWatchers);

		for (const fileWatcher of this.plugin.settings.fileWatchers) {
			const set = new Setting(div);
			set.setName(fileWatcher.file);
			if (!fileWatcher.active) {
				set.addButton((button) => {
					button.setCta();
					button.buttonEl.textContent = 'enable';
					button.onClick(() => {
						this.plugin.enableFileWatcher(fileWatcher);
						this.display();
					});
				});
			} else {
				set.addButton((button) => {
					button.setWarning();
					button.buttonEl.textContent = 'disable';
					button.onClick(() => {
						this.plugin.disableFileWatcher(fileWatcher);
						this.display();
					});
				});
			}

			set.addButton((button) => {
				button.setWarning();
				button.buttonEl.textContent = 'delete';
				button.onClick(() => {
					this.plugin.removeFileWatcher(fileWatcher);
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

/**
 * Helper for watchFile, also handling symlinks
 * From https://stackoverflow.com/questions/9364514/how-to-watch-symlinked-files-in-node-js-using-watchfile
 */
function watchFile(path: string, callback: (err?: any) => void): void {
	// Check if it's a link
	fs.lstat(path, function (err, stats) {
		if (err) {
			// Handle errors
			return callback(err);
		} else if (stats.isSymbolicLink()) {
			// Read symlink
			fs.readlink(path, function (err, realPath) {
				// Handle errors
				if (err) return callback(err);
				// Watch the real file
				fs.watchFile(realPath, {interval: 200}, callback);
			});
		} else {
			// It's not a symlink, just watch it
			fs.watchFile(path, {interval: 200}, callback);
		}
	});
}

function unwatchFile(path: string, callback: (err?: any) => void): void {
	// Check if it's a link
	fs.lstat(path, function (err, stats) {
		if (err) {
			// Handle errors
			return callback(err);
		} else if (stats.isSymbolicLink()) {
			// Read symlink
			fs.readlink(path, function (err, realPath) {
				// Handle errors
				if (err) return callback(err);
				// Watch the real file
				fs.unwatchFile(realPath);
			});
		} else {
			// It's not a symlink, just watch it
			fs.unwatchFile(path);
		}
	});
}
