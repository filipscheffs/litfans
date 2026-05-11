const rates = { USD: 1, PLN: 4.05, CNY: 7.2 };
let currentCurrency = "USD";
let favorites = JSON.parse(localStorage.getItem('favs')) || [];

const themes = {
    men: { logo: "logo.png", bg: "tlotlo.png" },
    woman: { logo: "logogirl.png", bg: "tlogirl.png" }
};

function normalizeProductIds(rawList) {
    const source = Array.isArray(rawList) ? rawList : [];
    const list = source.flatMap((product) => {
        const genders = Array.isArray(product.gender) ? product.gender : [product.gender];
        const images = Array.isArray(product.images) ? product.images : [product.img];
        return genders.flatMap((gender) => images.map((img) => ({ ...product, gender, img })));
    });
    let maxId = 0;
    for (const p of list) {
        if (typeof p.id === "number" && Number.isFinite(p.id)) maxId = Math.max(maxId, p.id);
    }
    let next = maxId + 1;
    const usedIds = new Set();
    return list.map((p) => {
        const row = { ...p };
        if (typeof row.id !== "number" || !Number.isFinite(row.id) || usedIds.has(row.id)) row.id = next++;
        usedIds.add(row.id);
        return row;
    });
}

const catalog = typeof window.PRODUCT_CATALOG !== "undefined" ? window.PRODUCT_CATALOG : [];
const products = normalizeProductIds(catalog);

function buildProductIndexes(list) {
    const byGender = { men: [], woman: [] };
    const byCategory = { men: new Map(), woman: new Map() };
    const byBrand = { men: new Map(), woman: new Map() };
    const menu = { men: { categories: [], brands: [] }, woman: { categories: [], brands: [] } };

    list.forEach((product) => {
        if (!byGender[product.gender]) return;
        byGender[product.gender].push(product);

        if (!byCategory[product.gender].has(product.category)) byCategory[product.gender].set(product.category, []);
        byCategory[product.gender].get(product.category).push(product);

        if (!byBrand[product.gender].has(product.brand)) byBrand[product.gender].set(product.brand, []);
        byBrand[product.gender].get(product.brand).push(product);
    });

    Object.keys(menu).forEach((gender) => {
        menu[gender].categories = [...byCategory[gender].keys()].sort();
        menu[gender].brands = [...byBrand[gender].keys()].sort();
    });

    return { byGender, byCategory, byBrand, menu };
}

const productIndex = buildProductIndexes(products);

const elSelectionScreen = document.getElementById('selection-screen');
const elMainContent = document.getElementById('main-content');
const elCategoryList = document.getElementById('categoryList');
const elBrandList = document.getElementById('brandList');
const elGrid = document.getElementById('productGrid');
const elFavCount = document.getElementById('fav-count');
const elToast = document.getElementById('toast');
const elSidebar = document.getElementById('sidebar');
const elOverlay = document.getElementById('overlay');
const elPageTitle = document.getElementById('pageTitle');
const elCurrencySelector = document.getElementById('currencySelector');
const elBg = document.getElementById('background-image');
const elSidebarLogo = document.getElementById('sidebarLogo');
const elHeaderLogo = document.getElementById('headerLogo');
const elSelectLogo = document.querySelector('.select-logo');
const elGenderMenBtn = document.getElementById('genderMenBtn');
const elGenderWomanBtn = document.getElementById('genderWomanBtn');
const elFitGeneratorModal = document.getElementById('fitGeneratorModal');
const elFitResult = document.getElementById('fitResult');
const elPagination = document.getElementById('pagination');

let favoriteSet = new Set(favorites);
let currentData = [...products];
let currentGender = "men";
let currentFilter = { type: "all", value: null };
let toastTimer = null;
let currentPage = 1;
let resizeTimer = null;
let lastLayoutMode = null;
const cardHtmlCache = new Map();
const CARD_CACHE_LIMIT = 600;
const PRODUCTS_PER_PAGE_DESKTOP = 64;
const PRODUCTS_PER_PAGE_MOBILE = 36;

function applyDeviceMode(device) {
    const finalDevice = device || (window.innerWidth <= 820 ? "mobile" : "laptop");
    document.body.setAttribute("data-device", finalDevice);
    localStorage.setItem("device", finalDevice);
    lastLayoutMode = finalDevice;
}

function isMobileMode() {
    return document.body.getAttribute("data-device") === "mobile" || window.innerWidth <= 768;
}

function getProductsPerPage() {
    return isMobileMode() ? PRODUCTS_PER_PAGE_MOBILE : PRODUCTS_PER_PAGE_DESKTOP;
}

function applyThemeAssets() {
    const theme = themes[currentGender] || themes.men;
    elBg.style.backgroundImage = `url('${theme.bg}')`;
    elSidebarLogo.src = theme.logo;
    elHeaderLogo.src = theme.logo;
    elSelectLogo.src = theme.logo;
}

function getGenderProducts() {
    return productIndex.byGender[currentGender] || [];
}

function escapeAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function initMenu() {
    const menu = productIndex.menu[currentGender] || { categories: [], brands: [] };
    elCategoryList.innerHTML = menu.categories.map((c) => `<div class="menu-item" data-filter-type="category" data-value="${escapeAttribute(c)}">${escapeHtml(c)}</div>`).join('');
    elBrandList.innerHTML = menu.brands.map((b) => `<div class="menu-item" data-filter-type="brand" data-value="${escapeAttribute(b)}">${escapeHtml(b)}</div>`).join('');
}

function resolveCurrentData() {
    if (currentFilter.type === "category") return productIndex.byCategory[currentGender]?.get(currentFilter.value) || [];
    if (currentFilter.type === "brand") return productIndex.byBrand[currentGender]?.get(currentFilter.value) || [];
    const source = getGenderProducts();
    if (currentFilter.type === "favorites") return source.filter((p) => favoriteSet.has(p.id));
    return source;
}

function refreshView() {
    currentData = resolveCurrentData();
    const totalPages = Math.max(1, Math.ceil(currentData.length / getProductsPerPage()));
    if (currentPage > totalPages) currentPage = totalPages;
    renderGrid(currentData);
}

function setGender(gender) {
    const nextGender = gender === "woman" ? "woman" : "men";
    if (currentGender === nextGender && elMainContent.style.display === 'block') return;
    currentGender = nextGender;
    localStorage.setItem("gender", currentGender);
    document.body.setAttribute("data-gender", currentGender);
    elGenderMenBtn.classList.toggle("active", currentGender === "men");
    elGenderWomanBtn.classList.toggle("active", currentGender === "woman");
    applyThemeAssets();
    currentFilter = { type: "all", value: null };
    currentPage = 1;
    elPageTitle.textContent = currentGender === "men" ? "WSZYSTKO" : "WOMAN";
    initMenu();
    refreshView();
    closeMenuIfOpen();
}

function startApp(device) {
    applyDeviceMode(device);
    elSelectionScreen.style.display = 'none';
    elMainContent.style.display = 'block';
}

const COUPON_REGISTER_URL = "https://litbuy.com/register?inviteCode=YYCONHQLC";

function openCoupons() {
    window.open(COUPON_REGISTER_URL, "_blank");
}

function openHowToOrder() {
    document.getElementById('howOrderModal').classList.add('active');
    document.body.classList.add('modal-open');
}

function closeHowToOrder(event) {
    if (event && event.target.id !== 'howOrderModal') return;
    document.getElementById('howOrderModal').classList.remove('active');
    document.body.classList.remove('modal-open');
}

function openFitGenerator() {
    elFitResult.innerHTML = '';
    elFitGeneratorModal.classList.add('active');
    document.body.classList.add('modal-open');
}

function closeFitGenerator(event) {
    if (event && event.target.id !== 'fitGeneratorModal') return;
    elFitGeneratorModal.classList.remove('active');
    document.body.classList.remove('modal-open');
}

function getRandomItem(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function generateFit() {
    const fitItems = [];
    const usedIds = new Set();
    const addRandomFromCategories = (categories, required = false, allowMenFallback = false) => {
        let categoryProducts = categories.flatMap((category) => productIndex.byCategory[currentGender]?.get(category) || []).filter((product) => !usedIds.has(product.id));
        if (!categoryProducts.length && allowMenFallback && currentGender === 'woman') {
            categoryProducts = categories.flatMap((category) => productIndex.byCategory.men.get(category) || []).filter((product) => !usedIds.has(product.id));
        }
        if (!categoryProducts.length) {
            if (required) elFitResult.innerHTML = `<div class="fit-empty">Brakuje itemów w kategorii: ${categories.join(' / ')}</div>`;
            return false;
        }
        const item = getRandomItem(categoryProducts);
        fitItems.push(item);
        usedIds.add(item.id);
        return true;
    };

    if (!addRandomFromCategories(['Buty'], true, true)) return;
    if (!addRandomFromCategories(['Spodnie', 'Shorty'], true)) return;
    if (!addRandomFromCategories(['Koszulki', 'Longsleeve'], true)) return;
    addRandomFromCategories(['Cap', 'Beanie']);
    addRandomFromCategories(['Torby', 'Akcesoria', 'Inne']);

    const total = fitItems.reduce((sum, product) => sum + product.price * rates[currentCurrency], 0);
    elFitResult.innerHTML = `
        <div class="fit-result-head">
            <span>TWÓJ FIT</span>
            <strong>${total.toFixed(2)} ${currentCurrency}</strong>
        </div>
        <div class="fit-result-grid">
            ${fitItems.map((product) => `
                <a class="fit-item-card" href="${escapeAttribute(product.url || '#')}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeAttribute(product.img || 'logo.png')}" alt="${escapeAttribute(product.name || 'Produkt Litfans')}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='logo.png';">
                    <div>
                        <span>${escapeHtml(product.category)}</span>
                        <h3>${escapeHtml(product.name)}</h3>
                        <p>${(product.price * rates[currentCurrency]).toFixed(2)} ${currentCurrency}</p>
                    </div>
                </a>
            `).join('')}
        </div>
    `;
}

function renderGrid(data) {
    const perPage = getProductsPerPage();
    const start = (currentPage - 1) * perPage;
    const pageData = data.slice(start, start + perPage);
    if (!pageData.length) {
        elGrid.innerHTML = '<div class="empty-state">Brak produktów do wyświetlenia.</div>';
        elFavCount.textContent = String(favoriteSet.size);
        renderPagination(data.length);
        return;
    }
    elGrid.innerHTML = pageData.map((p, index) => renderProductCard(p, index)).join('');
    elFavCount.textContent = String(favoriteSet.size);
    renderPagination(data.length);
}

function renderProductCard(p, index) {
    const eager = index < (isMobileMode() ? 6 : 16);
    const cacheKey = `${p.id}|${currentCurrency}|${eager ? 1 : 0}`;
    const cached = cardHtmlCache.get(cacheKey);
    if (cached) {
        return cached.replace('star-btn __FAV__', `star-btn ${favoriteSet.has(p.id) ? 'active' : ''}`);
    }
    const brand = escapeHtml(p.brand);
    const name = escapeHtml(p.name);
    const img = escapeAttribute(p.img || 'logo.png');
    const url = escapeAttribute(p.url || '#');
    const alt = escapeAttribute(`${p.brand || ''} ${p.name || ''}`.trim() || 'Produkt Litfans');
    const html = `
            <div class="card" data-product-id="${p.id}">
                <button class="star-btn __FAV__" data-product-id="${p.id}" type="button">★</button>
                <a href="${url}" target="_blank" rel="noopener noreferrer">
                    <div class="img-wrapper"><img src="${img}" alt="${alt}" class="img-main" width="320" height="378" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''} onerror="this.onerror=null;this.src='logo.png';"></div>
                    <div class="info">
                        <span class="brand-tag">${brand}</span>
                        <span class="product-name">${name}</span>
                        <span class="price-tag">${(p.price * rates[currentCurrency]).toFixed(2)} ${currentCurrency}</span>
                    </div>
                </a>
            </div>`;
    if (cardHtmlCache.size > CARD_CACHE_LIMIT) cardHtmlCache.clear();
    cardHtmlCache.set(cacheKey, html);
    return html.replace('star-btn __FAV__', `star-btn ${favoriteSet.has(p.id) ? 'active' : ''}`);
}

function renderPagination(totalItems) {
    if (!elPagination) return;
    const totalPages = Math.ceil(totalItems / getProductsPerPage());
    if (totalPages <= 1) {
        elPagination.innerHTML = '';
        return;
    }
    const pages = [];
    const visiblePages = new Set([1, totalPages]);
    for (let page = currentPage - 2; page <= currentPage + 2; page++) {
        if (page >= 1 && page <= totalPages) visiblePages.add(page);
    }
    let lastPage = 0;
    [...visiblePages].sort((a, b) => a - b).forEach((page) => {
        if (page - lastPage > 1) pages.push('<span class="pagination-dots">...</span>');
        pages.push(`<button class="pagination-btn ${page === currentPage ? 'active' : ''}" data-page="${page}" type="button">${page}</button>`);
        lastPage = page;
    });
    elPagination.innerHTML = pages.join('');
}

function goToPage(page) {
    const totalPages = Math.max(1, Math.ceil(currentData.length / getProductsPerPage()));
    currentPage = Math.min(Math.max(1, page), totalPages);
    renderGrid(currentData);
    window.scrollTo({ top: 0, behavior: isMobileMode() ? 'auto' : 'smooth' });
}

function showToast(message) {
    if (!elToast) return;
    elToast.textContent = message;
    elToast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elToast.classList.remove('show'), 1200);
}

function syncFavoriteButtons(id, active) {
    const buttons = document.querySelectorAll(`.star-btn[data-product-id="${id}"]`);
    buttons.forEach((btn) => btn.classList.toggle('active', active));
}

function toggleFav(id) {
    if (favoriteSet.has(id)) {
        favoriteSet.delete(id);
        showToast("Usunięto z ulubionych!");
    } else {
        favoriteSet.add(id);
        showToast("Dodano do ulubionych!");
    }
    favorites = [...favoriteSet];
    localStorage.setItem('favs', JSON.stringify(favorites));
    elFavCount.textContent = String(favoriteSet.size);

    if (currentFilter.type === "favorites") {
        refreshView();
        return;
    }
    syncFavoriteButtons(id, favoriteSet.has(id));
}

function toggleMenu() {
    const isOpen = elSidebar.classList.toggle('active');
    elOverlay.classList.toggle('active');
    document.body.classList.toggle('menu-open', isOpen);
    if (isOpen) elSidebar.scrollTop = 0;
}

function closeMenuIfOpen() {
    if (elSidebar.classList.contains('active')) toggleMenu();
}

elGrid.addEventListener('click', (event) => {
    const favoriteButton = event.target.closest('.star-btn');
    if (!favoriteButton) return;
    event.preventDefault();
    event.stopPropagation();
    toggleFav(Number(favoriteButton.dataset.productId));
});

elPagination.addEventListener('click', (event) => {
    const pageButton = event.target.closest('.pagination-btn');
    if (!pageButton) return;
    goToPage(Number(pageButton.dataset.page));
});

elSidebar.addEventListener('click', (event) => {
    const item = event.target.closest('.menu-item[data-filter-type]');
    if (!item) return;
    if (item.dataset.filterType === 'category') filterByCategory(item.dataset.value);
    if (item.dataset.filterType === 'brand') filterByBrand(item.dataset.value);
});

function showAll() {
    currentFilter = { type: "all", value: null };
    currentPage = 1;
    elPageTitle.textContent = "WSZYSTKO";
    refreshView();
    closeMenuIfOpen();
}

function filterByCategory(category) {
    currentFilter = { type: "category", value: category };
    currentPage = 1;
    elPageTitle.textContent = category;
    refreshView();
    closeMenuIfOpen();
}

function filterByBrand(brand) {
    currentFilter = { type: "brand", value: brand };
    currentPage = 1;
    elPageTitle.textContent = brand;
    refreshView();
    closeMenuIfOpen();
}

function filterFavorites() {
    currentFilter = { type: "favorites", value: null };
    currentPage = 1;
    elPageTitle.textContent = "ULUBIONE";
    refreshView();
}

function changeCurrency() {
    currentCurrency = elCurrencySelector.value;
    renderGrid(currentData);
}

window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const nextLayoutMode = window.innerWidth <= 820 ? "mobile" : "laptop";
        if (nextLayoutMode === lastLayoutMode) return;
        applyDeviceMode(nextLayoutMode);
        currentPage = 1;
        refreshView();
    }, 180);
});
