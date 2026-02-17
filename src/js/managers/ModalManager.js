export class ModalManager {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.currentDeletingCollectionId = null;
        this.currentEditingTab = null;

        // Gist Modal Elements
        this.gistModal = document.getElementById('gist-modal');
        this.gistLoginForm = document.getElementById('gist-login-form');
        this.gistLogoutConfirm = document.getElementById('gist-logout-confirm');
        this.gistErrorMessage = document.getElementById('gist-error-message');
        this.gistModalTitle = document.getElementById('gist-modal-title');
        this.githubTokenInput = document.getElementById('github-token');
        this.errorMessageText = document.getElementById('error-message-text');
        this.gistConnectBtn = document.getElementById('gist-connect-btn');
    }

    init() {
        this.initEditTabModal();
        this.initDeleteModal();
        this.initGistModal();
    }

    initEditTabModal() {
        const modal = document.getElementById('edit-tab-modal');
        if (!modal) return;

        const closeBtn = document.querySelector('.edit-tab-close');
        const form = document.getElementById('edit-tab-form');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        const deleteBtn = document.getElementById('delete-tab-btn');

        const closeModal = () => modal.classList.remove('flex');

        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);

        window.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        deleteBtn?.addEventListener('click', () => {
            if (this.currentEditingTab && this.callbacks.onDeleteTab) {
                const { tabId, collectionId } = this.currentEditingTab;
                this.callbacks.onDeleteTab(tabId, collectionId);
                closeModal();
            }
        });

        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.currentEditingTab && this.callbacks.onSaveTab) {
                const title = document.getElementById('edit-title').value.trim();
                const description = document.getElementById('edit-description').value.trim();
                const url = document.getElementById('edit-url').value.trim();

                if (title && url) {
                    this.callbacks.onSaveTab(this.currentEditingTab, { title, description, url });
                    closeModal();
                }
            }
        });
    }

    initDeleteModal() {
        const modal = document.getElementById('delete-modal');
        if (!modal) return;

        const closeBtn = document.querySelector('.delete-modal-close');
        const cancelBtn = document.getElementById('delete-cancel-btn');
        const confirmBtn = document.getElementById('delete-confirm-btn');

        const closeModal = () => modal.classList.remove('flex');

        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);

        window.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        confirmBtn?.addEventListener('click', () => {
            if (this.currentDeletingCollectionId && this.callbacks.onConfirmDeleteCollection) {
                this.callbacks.onConfirmDeleteCollection(this.currentDeletingCollectionId);
                this.currentDeletingCollectionId = null;
                closeModal();
            }
        });
    }

    initGistModal() {
        if (!this.gistModal) return;

        const closeBtn = document.querySelector('.gist-modal-close');
        const cancelBtn = document.getElementById('gist-cancel-btn');
        const cancelLogoutBtn = document.getElementById('gist-cancel-logout-btn');
        const logoutBtn = document.getElementById('gist-logout-btn');
        const closeErrorBtn = document.getElementById('gist-close-error-btn');

        const closeModal = () => this.closeGistModal();

        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        cancelLogoutBtn?.addEventListener('click', closeModal);
        closeErrorBtn?.addEventListener('click', closeModal);

        window.addEventListener('click', (e) => {
            if (e.target === this.gistModal) closeModal();
        });

        this.gistConnectBtn?.addEventListener('click', async () => {
            const token = this.githubTokenInput.value.trim();
            if (!token) return;

            if (this.callbacks.onGistConnect) {
                this.gistConnectBtn.disabled = true;
                this.gistConnectBtn.innerHTML = 'Connecting...';
                try {
                    await this.callbacks.onGistConnect(token);
                    closeModal();
                } catch (error) {
                    this.showGistModal('error', error.message);
                } finally {
                    this.gistConnectBtn.disabled = false;
                    this.gistConnectBtn.innerHTML = 'Connect';
                }
            }
        });

        logoutBtn?.addEventListener('click', async () => {
            if (this.callbacks.onGistLogout) {
                await this.callbacks.onGistLogout();
                closeModal();
            }
        });
    }

    showEditTab(tab, collectionId, collectionIndex, tabIndex) {
        this.currentEditingTab = { tabId: tab.id, collectionId, collectionIndex, tabIndex };

        document.getElementById('edit-title').value = tab.title;
        document.getElementById('edit-description').value = tab.description || '';
        document.getElementById('edit-url').value = tab.url;

        const faviconElement = document.getElementById('edit-tab-favicon');
        if (faviconElement && this.callbacks.setupFavicon) {
            this.callbacks.setupFavicon(faviconElement, tab);
        }

        const modal = document.getElementById('edit-tab-modal');
        modal.classList.add('flex');

        const titleInput = document.getElementById('edit-title');
        titleInput.focus();
        titleInput.select();
    }

    showDeleteCollection(collectionId) {
        this.currentDeletingCollectionId = collectionId;
        const modal = document.getElementById('delete-modal');
        modal.classList.add('flex');
    }

    showGistModal(mode, errorMessage = '') {
        this.githubTokenInput.value = '';

        if (mode === 'login') {
            this.gistModalTitle.textContent = 'Connect to GitHub Gist';
            this.gistLoginForm.classList.remove('hidden');
            this.gistLogoutConfirm.classList.add('hidden');
            this.gistErrorMessage.classList.add('hidden');
            setTimeout(() => this.githubTokenInput.focus(), 50);
        } else if (mode === 'logout') {
            this.gistModalTitle.textContent = 'Logout from GitHub Gist';
            this.gistLoginForm.classList.add('hidden');
            this.gistLogoutConfirm.classList.remove('hidden');
            this.gistErrorMessage.classList.add('hidden');
        } else if (mode === 'error') {
            this.gistModalTitle.textContent = 'Error';
            this.gistLoginForm.classList.add('hidden');
            this.gistLogoutConfirm.classList.add('hidden');
            this.gistErrorMessage.classList.remove('hidden');
            this.errorMessageText.textContent = errorMessage;
        }

        this.gistModal.classList.add('flex');
    }

    closeGistModal() {
        this.gistModal.classList.remove('flex');
        this.githubTokenInput.value = '';
    }
}
