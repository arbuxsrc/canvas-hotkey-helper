const { Plugin, Notice, PluginSettingTab, Setting } = require('obsidian');

/**
 * Default settings for the Canvas Hotkey Helper plugin
 */
const DEFAULT_SETTINGS = {
    padding: 20,
    defaultLabel: "",
    showNotices: true,
    debugMode: false
};

/**
 * Canvas Hotkey Helper Plugin
 * Adds commands to group selected canvas items with configurable settings
 */
module.exports = class CanvasHotkeyHelper extends Plugin {
    /**
     * Initialize plugin on load
     */
    async onload() {
        // Load settings
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new CanvasHotkeyHelperSettingTab(this.app, this));

        // Register command with availability check
        this.addCommand({
            id: 'canvas-group-selection',
            name: 'Canvas: Create group from selection',
            checkCallback: (checking) => {
                try {
                    // Get active canvas view
                    const canvasView = this.getActiveCanvasView();

                    // If just checking availability, return whether we have a valid canvas
                    if (checking) {
                        return canvasView !== null;
                    }

                    // Execute the command
                    this.createGroupFromSelection(canvasView);
                    return true;
                } catch (error) {
                    this.handleError('Command execution failed', error);
                    return false;
                }
            }
        });

        this.log('Canvas Hotkey Helper plugin loaded successfully');
    }

    /**
     * Load plugin settings
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Save plugin settings
     */
    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Get the currently active canvas view
     * @returns {Object|null} Canvas view object or null if not found
     */
    getActiveCanvasView() {
        try {
            const canvasLeaves = this.app.workspace.getLeavesOfType("canvas");

            if (!canvasLeaves || canvasLeaves.length === 0) {
                return null;
            }

            // Find the first valid canvas leaf
            const canvasLeaf = canvasLeaves.find(leaf => leaf?.view);

            if (!canvasLeaf) {
                return null;
            }

            return canvasLeaf.view;
        } catch (error) {
            this.log('Error getting active canvas view', error);
            return null;
        }
    }

    /**
     * Validate that a node has all required properties for grouping
     * @param {Object} node - Canvas node to validate
     * @returns {boolean} True if node is valid
     */
    isValidNode(node) {
        if (!node) {
            return false;
        }

        // Check for required numeric properties
        const hasPosition = typeof node.x === 'number' && typeof node.y === 'number';
        const hasDimensions = typeof node.width === 'number' && typeof node.height === 'number';

        // Ensure dimensions are positive
        const hasValidDimensions = node.width > 0 && node.height > 0;

        return hasPosition && hasDimensions && hasValidDimensions;
    }

    /**
     * Calculate bounding box for a set of nodes
     * @param {Array} nodes - Array of canvas nodes
     * @returns {Object|null} Bounding box {minX, minY, maxX, maxY} or null if invalid
     */
    calculateBoundingBox(nodes) {
        try {
            if (!nodes || nodes.length === 0) {
                return null;
            }

            // Filter to only valid nodes
            const validNodes = nodes.filter(node => this.isValidNode(node));

            if (validNodes.length === 0) {
                return null;
            }

            // Calculate bounds
            const minX = Math.min(...validNodes.map(n => n.x));
            const minY = Math.min(...validNodes.map(n => n.y));
            const maxX = Math.max(...validNodes.map(n => n.x + n.width));
            const maxY = Math.max(...validNodes.map(n => n.y + n.height));

            // Validate results
            if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
                return null;
            }

            return { minX, minY, maxX, maxY };
        } catch (error) {
            this.log('Error calculating bounding box', error);
            return null;
        }
    }

    /**
     * Create a group from the currently selected canvas nodes
     * @param {Object} canvasView - The active canvas view
     */
    createGroupFromSelection(canvasView) {
        try {
            // Validate canvas view
            if (!canvasView) {
                this.showNotice('No active canvas found');
                return;
            }

            const canvas = canvasView.canvas;

            if (!canvas) {
                this.showNotice('Canvas object not available');
                return;
            }

            // Check if createGroupNode API is available
            if (typeof canvas.createGroupNode !== 'function') {
                this.showNotice('Canvas grouping API not available. Please update Obsidian.');
                this.log('createGroupNode method not found on canvas object');
                return;
            }

            // Get selection
            const selection = canvas.selection;

            if (!selection) {
                this.showNotice('No selection available');
                return;
            }

            // Check minimum selection size
            if (selection.size < 2) {
                this.showNotice('Please select at least 2 items to create a group');
                return;
            }

            // Convert selection to array
            const nodes = Array.from(selection);

            // Validate nodes
            const validNodes = nodes.filter(node => this.isValidNode(node));

            if (validNodes.length === 0) {
                this.showNotice('Selected items are not valid canvas nodes');
                return;
            }

            if (validNodes.length < 2) {
                this.showNotice(`Only ${validNodes.length} valid node(s) selected. Need at least 2.`);
                return;
            }

            // Calculate bounding box
            const bounds = this.calculateBoundingBox(validNodes);

            if (!bounds) {
                this.showNotice('Unable to calculate bounds for selected nodes');
                return;
            }

            // Get padding from settings
            const padding = this.settings.padding;

            // Calculate group dimensions
            const width = (bounds.maxX - bounds.minX) + (padding * 2);
            const height = (bounds.maxY - bounds.minY) + (padding * 2);

            // Validate dimensions
            if (width <= 0 || height <= 0) {
                this.showNotice('Invalid group dimensions calculated');
                return;
            }

            // Create the group
            canvas.createGroupNode({
                pos: {
                    x: bounds.minX - padding,
                    y: bounds.minY - padding
                },
                size: {
                    width: width,
                    height: height
                },
                label: this.settings.defaultLabel
            });

            // Request save
            if (typeof canvas.requestSave === 'function') {
                canvas.requestSave();
            }

            this.showNotice(`Group created with ${validNodes.length} node(s)`);
            this.log(`Successfully created group with ${validNodes.length} nodes`);

        } catch (error) {
            this.handleError('Failed to create group from selection', error);
        }
    }

    /**
     * Show a notice to the user if notices are enabled
     * @param {string} message - Message to display
     */
    showNotice(message) {
        if (this.settings.showNotices) {
            new Notice(message);
        }
    }

    /**
     * Log a message if debug mode is enabled
     * @param {string} message - Message to log
     * @param {*} data - Optional data to log
     */
    log(message, data) {
        if (this.settings.debugMode) {
            console.log(`[Canvas Hotkey Helper] ${message}`, data || '');
        }
    }

    /**
     * Handle and log errors
     * @param {string} context - Context where error occurred
     * @param {Error} error - The error object
     */
    handleError(context, error) {
        const errorMessage = `${context}: ${error.message}`;
        console.error(`[Canvas Hotkey Helper] ${errorMessage}`, error);
        this.showNotice(errorMessage);
    }
};

/**
 * Settings tab for Canvas Hotkey Helper
 */
class CanvasHotkeyHelperSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Canvas Hotkey Helper Settings' });

        // Padding setting
        new Setting(containerEl)
            .setName('Group padding')
            .setDesc('Amount of padding (in pixels) around grouped nodes')
            .addText(text => text
                .setPlaceholder('20')
                .setValue(String(this.plugin.settings.padding))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.padding = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        // Default label setting
        new Setting(containerEl)
            .setName('Default group label')
            .setDesc('Default label text for newly created groups (leave empty for no label)')
            .addText(text => text
                .setPlaceholder('Group')
                .setValue(this.plugin.settings.defaultLabel)
                .onChange(async (value) => {
                    this.plugin.settings.defaultLabel = value;
                    await this.plugin.saveSettings();
                }));

        // Show notices setting
        new Setting(containerEl)
            .setName('Show notifications')
            .setDesc('Display status messages and error notifications')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showNotices)
                .onChange(async (value) => {
                    this.plugin.settings.showNotices = value;
                    await this.plugin.saveSettings();
                }));

        // Debug mode setting
        new Setting(containerEl)
            .setName('Debug mode')
            .setDesc('Enable debug logging to console (for troubleshooting)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));
    }
}
