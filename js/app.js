const state = {
  photos: [],
  selectedIds: new Set(loadSelectedIds()),
  currentPhotoIndex: -1,
  lastFocusedElement: null
};

const elements = {
  gallery: document.querySelector("#gallery"),
  resultCount: document.querySelector("#result-count"),
  selectionCount: document.querySelector("#selection-count"),
  clearSelection: document.querySelector("#clear-selection"),
  emptyState: document.querySelector("#empty-state"),
  loadingState: document.querySelector("#loading-state"),
  lightbox: document.querySelector("#lightbox"),
  lightboxImage: document.querySelector("#lightbox-image"),
  lightboxTitle: document.querySelector("#lightbox-title"),
  lightboxCategory: document.querySelector("#lightbox-category"),
  lightboxDescription: document.querySelector("#lightbox-description"),
  lightboxPosition: document.querySelector("#lightbox-position"),
  lightboxSelect: document.querySelector("#lightbox-select"),
  downloadPhoto: document.querySelector("#download-photo"),
  closeLightbox: document.querySelector("#close-lightbox"),
  previousPhoto: document.querySelector("#previous-photo"),
  nextPhoto: document.querySelector("#next-photo")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  updateSelectionSummary();

  try {
    const response = await fetch(resolvePath("data/photos.json"), {
      cache: "no-cache"
    });
    if (!response.ok) throw new Error(`Falha ao carregar o JSON: ${response.status}`);
    const data = await response.json();
    state.photos = Array.isArray(data.photos) ? data.photos : [];
    renderGallery();
  } catch (error) {
    console.error(error);
    showLoadingError();
  }

  registerServiceWorker();
}

function bindEvents() {
  elements.gallery.addEventListener("click", (event) => {
    const selectionButton = event.target.closest("[data-select-id]");
    if (selectionButton) {
      event.stopPropagation();
      toggleSelection(selectionButton.dataset.selectId);
      return;
    }
    const photoButton = event.target.closest("[data-photo-index]");
    if (photoButton) {
      openLightbox(Number(photoButton.dataset.photoIndex));
    }
  });

  elements.clearSelection.addEventListener("click", () => {
    state.selectedIds.clear();
    saveSelectedIds();
    updateSelectionSummary();
    renderGallery();
    if (!elements.lightbox.hidden) {
      updateLightboxSelection();
      updateDownloadButton();
    }
  });

  elements.closeLightbox.addEventListener("click", closeLightbox);
  elements.lightbox.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-lightbox]")) closeLightbox();
  });
  elements.previousPhoto.addEventListener("click", () => navigateLightbox(-1));
  elements.nextPhoto.addEventListener("click", () => navigateLightbox(1));
  elements.lightboxSelect.addEventListener("click", () => {
    const photo = state.photos[state.currentPhotoIndex];
    if (photo) {
      toggleSelection(photo.id);
      updateLightboxSelection();
      updateDownloadButton();
    }
  });

  elements.downloadPhoto.addEventListener("click", () => {
    const selectedCount = state.selectedIds.size;
    if (selectedCount > 1) {
      downloadSelected();
    } else if (selectedCount === 1) {
      const selectedId = [...state.selectedIds][0];
      const photo = state.photos.find(p => p.id === selectedId);
      if (photo) downloadSingle(photo);
    } else {
      const photo = state.photos[state.currentPhotoIndex];
      if (photo) downloadSingle(photo);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (elements.lightbox.hidden) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") navigateLightbox(-1);
    if (event.key === "ArrowRight") navigateLightbox(1);
  });
}

function renderGallery() {
  const photos = state.photos;
  elements.gallery.innerHTML = "";
  elements.resultCount.textContent = `${photos.length} ${photos.length === 1 ? "fotografia" : "fotografias"}`;
  elements.emptyState.hidden = photos.length > 0;
  elements.loadingState.hidden = true;

  const fragment = document.createDocumentFragment();
  photos.forEach((photo, index) => {
    fragment.append(createPhotoCard(photo, index));
  });
  elements.gallery.append(fragment);
}

function createPhotoCard(photo, index) {
  const article = document.createElement("article");
  article.className = "photo-card";
  const isSelected = state.selectedIds.has(photo.id);

  article.innerHTML = `
    <button
      class="selection-toggle${isSelected ? " is-selected" : ""}"
      type="button"
      data-select-id="${escapeAttribute(photo.id)}"
      aria-label="${isSelected ? "Remover da seleção" : "Selecionar"}: ${escapeAttribute(photo.title)}"
      aria-pressed="${isSelected}"
    >${isSelected ? "✓" : "+"}</button>

    <button
      class="photo-card-button"
      type="button"
      data-photo-index="${index}"
      aria-label="Abrir fotografia: ${escapeAttribute(photo.title)}"
    >
      <span class="photo-card-image-wrapper">
        <img
          src="${escapeAttribute(resolvePath(photo.thumbnail))}"
          alt="${escapeAttribute(photo.title)}"
          loading="lazy"
          decoding="async"
        >
      </span>
      <span class="photo-card-info">
        <span class="photo-card-title">${escapeHtml(photo.title)}</span>
      </span>
    </button>
  `;
  return article;
}

function openLightbox(index) {
  if (!state.photos[index]) return;
  state.currentPhotoIndex = index;
  state.lastFocusedElement = document.activeElement;
  elements.lightbox.hidden = false;
  document.body.classList.add("is-lightbox-open");
  renderLightboxPhoto();
  elements.closeLightbox.focus();
}

function renderLightboxPhoto() {
  const photo = state.photos[state.currentPhotoIndex];
  if (!photo) return;

  elements.lightboxImage.src = resolvePath(photo.image);
  elements.lightboxImage.alt = photo.title;
  elements.lightboxTitle.textContent = photo.title;
  elements.lightboxCategory.textContent = "";
  elements.lightboxCategory.hidden = true;
  elements.lightboxDescription.textContent = photo.description || "";
  elements.lightboxDescription.hidden = !photo.description;
  elements.lightboxPosition.textContent = `${state.currentPhotoIndex + 1} de ${state.photos.length}`;

  updateDownloadButton();

  elements.previousPhoto.disabled = state.currentPhotoIndex === 0;
  elements.nextPhoto.disabled = state.currentPhotoIndex === state.photos.length - 1;

  updateLightboxSelection();
}

function navigateLightbox(direction) {
  const next = state.currentPhotoIndex + direction;
  if (next < 0 || next >= state.photos.length) return;
  state.currentPhotoIndex = next;
  renderLightboxPhoto();
}

function closeLightbox() {
  elements.lightbox.hidden = true;
  document.body.classList.remove("is-lightbox-open");
  elements.lightboxImage.src = "";
  if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === "function") {
    state.lastFocusedElement.focus();
  }
}

function toggleSelection(photoId) {
  if (state.selectedIds.has(photoId)) {
    state.selectedIds.delete(photoId);
  } else {
    state.selectedIds.add(photoId);
  }
  saveSelectedIds();
  updateSelectionSummary();
  renderGallery();
  if (!elements.lightbox.hidden) {
    updateLightboxSelection();
    updateDownloadButton();
  }
}

function updateLightboxSelection() {
  const photo = state.photos[state.currentPhotoIndex];
  if (!photo) return;
  const isSelected = state.selectedIds.has(photo.id);
  elements.lightboxSelect.textContent = isSelected ? "Remover seleção" : "Selecionar";
  elements.lightboxSelect.classList.toggle("is-selected", isSelected);
  elements.lightboxSelect.setAttribute("aria-pressed", String(isSelected));
}

function updateDownloadButton() {
  const count = state.selectedIds.size;
  const btn = elements.downloadPhoto;
  if (count > 1) {
    btn.textContent = `Baixar selecionadas (${count})`;
  } else {
    btn.textContent = "Baixar foto";
  }
}

function updateSelectionSummary() {
  const count = state.selectedIds.size;
  elements.selectionCount.textContent = `${count} ${count === 1 ? "selecionada" : "selecionadas"}`;
  elements.clearSelection.hidden = count === 0;
}

// Download de uma única imagem (converte para JPEG via canvas)
function downloadSingle(photo) {
  const url = resolvePath(photo.image);
  const fileName = getDownloadName(photo);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;

  img.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    canvas.toBlob(function(blob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/jpeg', 0.92);
  };

  img.onerror = function() {
    console.warn('Falha ao converter para JPEG, baixando original:', url);
    const link = document.createElement('a');
    link.href = url;
    link.download = getDownloadName(photo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
}

// Download de todas as imagens selecionadas em um único arquivo ZIP
function downloadSelected() {
  const selectedIds = [...state.selectedIds];
  if (selectedIds.length === 0) return;

  // Verifica se JSZip está disponível
  if (typeof JSZip === 'undefined') {
    console.warn('JSZip não carregado. Baixando uma a uma.');
    // Fallback para download sequencial (com confirmação individual)
    selectedIds.forEach((id, index) => {
      const photo = state.photos.find(p => p.id === id);
      if (photo) {
        setTimeout(() => downloadSingle(photo), index * 200);
      }
    });
    return;
  }

  const zip = new JSZip();
  const folder = zip.folder('x-senei-fotos');

  // Carrega todas as imagens selecionadas e as adiciona ao ZIP
  const promises = selectedIds.map((id) => {
    return new Promise((resolve, reject) => {
      const photo = state.photos.find(p => p.id === id);
      if (!photo) return resolve();

      const url = resolvePath(photo.image);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;

      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(function(blob) {
          const fileName = getDownloadName(photo);
          folder.file(fileName, blob);
          resolve();
        }, 'image/jpeg', 0.92);
      };

      img.onerror = function() {
        // Fallback: baixa a imagem original (sem conversão)
        fetch(url)
          .then(res => res.blob())
          .then(blob => {
            const fileName = getDownloadName(photo);
            folder.file(fileName, blob);
            resolve();
          })
          .catch(reject);
      };
    });
  });

  Promise.all(promises)
    .then(() => {
      zip.generateAsync({ type: 'blob' })
        .then((content) => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(content);
          link.download = `x-senei-fotos-selecionadas.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        });
    })
    .catch((error) => {
      console.error('Erro ao gerar ZIP:', error);
      alert('Ocorreu um erro ao gerar o ZIP. Tente novamente.');
    });
}

// Gera o nome do arquivo com extensão .jpg
function getDownloadName(photo) {
  const safeId = String(photo.id).replace(/[^a-z0-9-_]/gi, '-');
  return `x-senei-${safeId}.jpg`;
}

function loadSelectedIds() {
  try {
    const stored = JSON.parse(localStorage.getItem("x-senei-selected") || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveSelectedIds() {
  localStorage.setItem("x-senei-selected", JSON.stringify([...state.selectedIds]));
}

function showLoadingError() {
  elements.loadingState.hidden = false;
  elements.loadingState.textContent = "Não foi possível carregar as fotografias. Verifique o arquivo data/photos.json.";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(resolvePath("sw.js"))
      .catch((error) => console.warn("Service Worker não registrado:", error));
  });
}

function resolvePath(path) {
  return new URL(path, window.APP_BASE).href;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value);
}