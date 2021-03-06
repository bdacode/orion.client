/*******************************************************************************
 *
 * @license
 * Copyright (c) 2010, 2013 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License v1.0
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html).
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*jslint browser:true devel:true sub:true*/
/*global define eclipse:true orion:true window*/

define([
	'i18n!orion/edit/nls/messages',
	'orion/sidebar',
	'orion/inputManager',
	'orion/globalCommands',
	'orion/folderView',
	'orion/editorView',
	'orion/editorDelegatedView',
	'orion/markdownView',
	'orion/commandRegistry',
	'orion/contentTypes',
	'orion/fileClient',
	'orion/fileCommands',
	'orion/selection',
	'orion/status',
	'orion/progress',
	'orion/operationsClient',
	'orion/outliner',
	'orion/dialogs',
	'orion/extensionCommands',
	'orion/searchClient',
	'orion/problems',
	'orion/blameAnnotations',
	'orion/Deferred',
	'orion/EventTarget',
	'orion/URITemplate',
	'orion/i18nUtil',
	'orion/PageUtil',
	'orion/webui/littlelib',
	'orion/projectClient'
], function(
	messages, Sidebar, mInputManager, mGlobalCommands,
	mFolderView, mEditorView, mDelegatedView , mMarkdownView,
	mCommandRegistry, mContentTypes, mFileClient, mFileCommands, mSelection, mStatus, mProgress, mOperationsClient, mOutliner, mDialogs, mExtensionCommands, mSearchClient,
	mProblems, mBlameAnnotation,
	Deferred, EventTarget, URITemplate, i18nUtil, PageUtil, lib, mProjectClient
) {

var exports = {};

exports.setUpEditor = function(serviceRegistry, preferences, isReadOnly) {
	var selection;
	var commandRegistry;
	var statusService;
	var problemService;
	var blameService;
	var outlineService;
	var contentTypeRegistry;
	var progressService;
	var dialogService;
	var fileClient;
	var projectClient;
	var searcher;

	// Initialize the plugin registry
	(function() {
		selection = new mSelection.Selection(serviceRegistry);
		var operationsClient = new mOperationsClient.OperationsClient(serviceRegistry);
		statusService = new mStatus.StatusReportingService(serviceRegistry, operationsClient, "statusPane", "notifications", "notificationArea"); //$NON-NLS-2$ //$NON-NLS-1$ //$NON-NLS-0$
		dialogService = new mDialogs.DialogService(serviceRegistry);
		commandRegistry = new mCommandRegistry.CommandRegistry({selection: selection});
		progressService = new mProgress.ProgressService(serviceRegistry, operationsClient, commandRegistry);

		// Editor needs additional services
		problemService = new mProblems.ProblemService(serviceRegistry);
		outlineService = new mOutliner.OutlineService({serviceRegistry: serviceRegistry, preferences: preferences});
		contentTypeRegistry = new mContentTypes.ContentTypeRegistry(serviceRegistry);
		fileClient = new mFileClient.FileClient(serviceRegistry);
		projectClient = new mProjectClient.ProjectClient(serviceRegistry, fileClient);
		searcher = new mSearchClient.Searcher({serviceRegistry: serviceRegistry, commandService: commandRegistry, fileService: fileClient});
		blameService = new mBlameAnnotation.BlameService(serviceRegistry);
	}());

	var sidebarDomNode = lib.node("sidebar"), //$NON-NLS-0$
		sidebarToolbar = lib.node("sidebarToolbar"), //$NON-NLS-0$
		editorDomNode = lib.node("editor"); //$NON-NLS-0$

	//mGlobalCommands.setPageCommandExclusions(["orion.editFromMetadata"]); //$NON-NLS-0$
	// Do not collapse sidebar, https://bugs.eclipse.org/bugs/show_bug.cgi?id=418558
	var collapseSidebar = false; //PageUtil.hash() !== ""
	mGlobalCommands.generateBanner("orion-editor", serviceRegistry, commandRegistry, preferences, searcher, null, null, collapseSidebar); //$NON-NLS-0$

	var editor, editorDirtyListener, inputManager, sidebarNavInputManager, editorView, lastRoot;
	function setEditor(newEditor) {
		if (editor) {
			editor.addEventListener("DirtyChanged", editorDirtyListener); //$NON-NLS-0$
		}
		editor = newEditor;
		if (editor) {
			editor.addEventListener("DirtyChanged", editorDirtyListener = function(evt) { //$NON-NLS-0$
				mGlobalCommands.setDirtyIndicator(editor.isDirty());
			});
		}
	}
	function renderToolbars(metadata) {
		var deferred;
		var toolbar = lib.node("pageActions"); //$NON-NLS-0$
		if (toolbar) {
			if (metadata) {
				// now add any "orion.navigate.command" commands that should be shown in non-nav pages.
				deferred = mExtensionCommands.createAndPlaceFileCommandsExtension(serviceRegistry, commandRegistry, toolbar.id, 500).then(function() {
					commandRegistry.destroy(toolbar);
					commandRegistry.renderCommands(toolbar.id, toolbar, metadata, editor, "button"); //$NON-NLS-0$
				});
			} else {
				commandRegistry.destroy(toolbar);
			}
		}
		var rightToolbar = lib.node("pageNavigationActions"); //$NON-NLS-0$
		if (rightToolbar) {
			commandRegistry.destroy(rightToolbar);
			if (metadata) {
				commandRegistry.renderCommands(rightToolbar.id, rightToolbar, metadata, editor, "button"); //$NON-NLS-0$
			}
		}
		var settingsToolbar = lib.node("settingsActions"); //$NON-NLS-0$
		if (settingsToolbar) {
			commandRegistry.destroy(settingsToolbar);
			if (metadata) {
				commandRegistry.renderCommands(settingsToolbar.id, settingsToolbar, metadata, editor, "button"); //$NON-NLS-0$
			}
		}
		return deferred;
	}
	
	function statusReporter(message, type, isAccessible) {
		if (type === "progress") { //$NON-NLS-0$
			statusService.setProgressMessage(message);
		} else if (type === "error") { //$NON-NLS-0$
			statusService.setErrorMessage(message);
		} else {
			statusService.setMessage(message, null, isAccessible);
		}
	}

	var uriTemplate = new URITemplate("#{,resource,params*}"); //$NON-NLS-0$
	var sidebarNavBreadcrumb = function(/**HTMLAnchorElement*/ segment, folderLocation, folder) {
		var resource = folder ? folder.Location : fileClient.fileServiceRootURL(folderLocation);
		segment.href = uriTemplate.expand({resource: resource});
		if (folder) {
			var metadata = inputManager.getFileMetadata();
			if (metadata && metadata.Location === folder.Location) {
				segment.addEventListener("click", function() { //$NON-NLS-0$
					sidebarNavInputManager.reveal(folder);
				});
			}
		}
	};
	
	var currentEditorView;
	function getEditorView(input, metadata) {
		var view = null;
		if (metadata && input) {
			var options = {
				parent: editorDomNode,
				input: input,
				metadata: metadata,
				serviceRegistry: serviceRegistry,
				commandService: commandRegistry,
				contentTypeRegistry: contentTypeRegistry,
				selection: selection,
				fileService: fileClient,
				progressService: progressService
			};
			if (metadata.Directory) {
				view = new mFolderView.FolderView(options);
			} else {
				if (input.contentProvider) {
					var contentProviders = serviceRegistry.getServiceReferences("orion.edit.content"); //$NON-NLS-0$
					for (var i=0; i<contentProviders.length; i++) {
						var id = contentProviders[i].getProperty("id"); //$NON-NLS-0$
						if (id === input.contentProvider) {
							options.contentProvider = contentProviders[i];
							view = new mDelegatedView.DelegatedEditorView(options);
							break;
						}
					}
				}
				if (!view) {
					if (input.contentProvider === "orion.edit.markdownContent") { //$NON-NLS-0$
						view = new mMarkdownView.MarkdownEditorView(options);
					} else {
						view = editorView;
					}
				}
			}
		}
		if (currentEditorView !== view) {
			commandRegistry.closeParameterCollector();
			if (currentEditorView) {
				currentEditorView.destroy();
			}
			currentEditorView = view;
			if (currentEditorView) {
				currentEditorView.create();
			}
		}
		return currentEditorView;
	}
	
	var switchScope = "settingsActions"; //$NON-NLS-0$
	commandRegistry.addCommandGroup(switchScope, "orion.edit.switch", 1000, messages.switchEditor, null, null, "core-sprite-outline", null, "dropdownSelection"); //$NON-NLS-3$ //$NON-NLS-2$ //$NON-NLS-1$ //$NON-NLS-0$
	Deferred.when(contentTypeRegistry.getContentTypes(), function(contentTypes) {
		mExtensionCommands._getOpenWithNavCommandExtensions(serviceRegistry, contentTypes).forEach(function(command) {
			var id = command.properties.id;
			commandRegistry.registerCommandContribution(switchScope, id, 1, "orion.edit.switch/" + id); //$NON-NLS-0$
		});
	});

	inputManager = new mInputManager.InputManager({
		serviceRegistry: serviceRegistry,
		fileClient: fileClient,
		progressService: progressService,
		statusReporter: statusReporter,
		selection: selection,
		contentTypeRegistry: contentTypeRegistry
	});
	inputManager.addEventListener("InputChanged", function(evt) { //$NON-NLS-0$
		var metadata = evt.metadata;
		
		var view = getEditorView(evt.input, metadata);
		setEditor(view ? view.editor : null);
		evt.editor = editor;
	
		var deferred = renderToolbars(metadata);
		var name = evt.name, target = metadata;
		if (evt.input === null || evt.input === undefined) {
			name = lastRoot ? lastRoot.Name : "";
			target = lastRoot;
		}
		mGlobalCommands.setPageTarget({
			task: "Editor", //$NON-NLS-0$
			name: name,
			target: target,
			makeAlternate: function() {
				if (metadata && metadata.Parents && metadata.Parents.length > 0) {
					// The mini-nav in sidebar wants to do the same work, can we share it?
					return progressService.progress(fileClient.read(metadata.Parents[0].Location, true), i18nUtil.formatMessage(messages.ReadingMetadata, metadata.Parents[0].Location));
				}
			},
			makeBreadcrumbLink: sidebarNavBreadcrumb,
			makeBreadcrumFinalLink: true,
			serviceRegistry: serviceRegistry,
			commandService: commandRegistry,
			searchService: searcher,
			fileService: fileClient
		});

		function processURL() {
			commandRegistry.processURL(window.location.href);
		}
		if (deferred) {
			deferred.then(processURL);
		} else {
			processURL();
		}
	});
	
	editorView = new mEditorView.EditorView({
		parent: editorDomNode,
		renderToolbars: renderToolbars,
		fileService: fileClient,
		progressService: progressService,
		serviceRegistry: serviceRegistry,
		statusService: statusService,
		statusReporter: statusReporter,
		inputManager: inputManager,
		preferences: preferences,
		readonly: isReadOnly,
		searcher: searcher,
		commandRegistry: commandRegistry,
		contentTypeRegistry: contentTypeRegistry
	});

	// Sidebar
	function SidebarNavInputManager() {
		EventTarget.attach(this);
	}
	sidebarNavInputManager = new SidebarNavInputManager();
	var sidebar = new Sidebar({
		commandRegistry: commandRegistry,
		contentTypeRegistry: contentTypeRegistry,
		editorInputManager: inputManager,
		fileClient: fileClient,
		outlineService: outlineService,
		parent: sidebarDomNode,
		progressService: progressService,
		selection: selection,
		serviceRegistry: serviceRegistry,
		sidebarNavInputManager: sidebarNavInputManager,
		toolbar: sidebarToolbar
	});
	SidebarNavInputManager.prototype.processHash = function() {
		var navigate = PageUtil.matchResourceParameters().navigate;
		if (typeof navigate === "string" && this.setInput && sidebar.getActiveViewModeId() === "nav") { //$NON-NLS-1$ //$NON-NLS-0$
			this.setInput(navigate);
		}
	};
	sidebar.show();
	sidebarNavInputManager.addEventListener("rootChanged", function(evt) { //$NON-NLS-0$
		lastRoot = evt.root;
	});
	var gotoInput = function(evt) { //$NON-NLS-0$
		var newInput = evt.newInput || ""; //$NON-NLS-0$
		window.location = uriTemplate.expand({resource: newInput}); //$NON-NLS-0$
	};
	sidebarNavInputManager.addEventListener("filesystemChanged", gotoInput); //$NON-NLS-0$
	sidebarNavInputManager.addEventListener("editorInputMoved", gotoInput); //$NON-NLS-0$
	sidebarNavInputManager.addEventListener("create", function(evt) { //$NON-NLS-0$
		if (evt.newValue) {
			window.location = uriTemplate.expand({resource: evt.newValue.Location});
		}
	});

	selection.addEventListener("selectionChanged", function(event) { //$NON-NLS-0$
		inputManager.setInput(event.selection);
	});
	window.addEventListener("hashchange", function() { //$NON-NLS-0$
		inputManager.setInput(PageUtil.hash());
		sidebarNavInputManager.processHash(PageUtil.hash());
	});
	inputManager.setInput(PageUtil.hash());
	sidebarNavInputManager.processHash(PageUtil.hash());

	window.onbeforeunload = function() {
		if (editor && editor.isDirty()) {
			 return messages.unsavedChanges;
		}
	};
};
return exports;
});
