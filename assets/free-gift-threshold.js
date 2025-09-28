/**
 * Free Gift Threshold Manager
 * Handles threshold-based free gift promotions with cart monitoring
 */

(function () {
  "use strict";

  // Cache frequently accessed DOM elements
  const domCache = {
    elements: new Map(),

    get(selector) {
      if (!this.elements.has(selector)) {
        this.elements.set(selector, document.querySelector(selector));
      }
      return this.elements.get(selector);
    },

    clear() {
      this.elements.clear();
    },
  };

  class FreeGiftManager {
    constructor(section) {
      this.section = section;
      this.threshold = parseInt(section.dataset.threshold) || 0;
      this.sectionId = section.dataset.sectionId;
      this.selectedGift = null;
      this.isProcessing = false;
      this.cartData = null;
      this.lastCartTotal = 0;
      this.lastUpdateTime = 0;
      this.updateDebounceTime = 150;
      this.monitoringActive = false;

      this.bindMethods();
      this.initialize();
    }

    bindMethods() {
      this.handleSectionChange = this.handleSectionChange.bind(this);
      this.handleAddGift = this.handleAddGift.bind(this);
      this.handleCartUpdate = this.handleCartUpdate.bind(this);
      this.updateCartState = this.updateCartState.bind(this);
    }

    async initialize() {
      try {
        await this.fetchCartData();
        this.setupEventListeners();
        this.startMonitoring();
        this.updateDisplay();
      } catch (error) {
        this.showNotification("Failed to initialize gift system", "error");
      }
    }

    setupEventListeners() {
      // Remove existing listeners to prevent duplicates
      this.section.removeEventListener("change", this.handleSectionChange);
      this.section.addEventListener("change", this.handleSectionChange);

      const addButton = this.section.querySelector(".gift-add-btn");
      if (addButton) {
        addButton.removeEventListener("click", this.handleAddGift);
        addButton.addEventListener("click", this.handleAddGift);
      }
    }

    handleSectionChange(event) {
      const target = event.target;

      if (target.classList.contains("gift-radio")) {
        this.selectProductByRadio(target);
      } else if (target.classList.contains("gift-variant-select")) {
        this.selectVariant(target);
      }
    }

    selectProductByRadio(radio) {
      const productCard = radio.closest(".gift-product-card");
      if (!productCard) return;

      const productId = productCard.dataset.productId;

      // Hide all variant selections
      this.section
        .querySelectorAll(".gift-variant-selection")
        .forEach((selection) => {
          selection.style.display = "none";
        });

      // Show variant selection if needed
      const variantSelection = productCard.querySelector(
        ".gift-variant-selection"
      );
      if (variantSelection) {
        variantSelection.style.display = "block";
        const variantSelect = variantSelection.querySelector(
          ".gift-variant-select"
        );
        if (variantSelect) {
          variantSelect.value = "";
        }
        this.clearSelectedGift();
        return;
      }

      // Handle single variant products
      this.selectSingleVariantProduct(productCard);
    }

    selectSingleVariantProduct(productCard) {
      const productTitle =
        productCard.dataset.productTitle ||
        productCard.querySelector(".gift-card-heading")?.textContent.trim() ||
        "";
      const productImage =
        productCard.dataset.productImage ||
        productCard.querySelector(".gift-card-media img")?.src ||
        "";
      const variantId = productCard.dataset.firstVariantId;
      const variantPrice = productCard.dataset.firstVariantPrice;

      if (variantId && variantPrice) {
        this.selectedGift = {
          variantId,
          title: productTitle,
          price: variantPrice,
          image: productImage,
        };
        this.showSelectedGift();
      } else {
        this.fetchProductVariants(productCard.dataset.productId).then(
          (product) => {
            if (product?.variants?.length > 0) {
              const firstVariant = product.variants[0];
              this.selectedGift = {
                variantId: firstVariant.id,
                title: productTitle,
                price: firstVariant.price,
                image: productImage,
              };
              this.showSelectedGift();
            }
          }
        );
      }
    }

    async fetchProductVariants(productId) {
      try {
        const response = await fetch(`/products/${productId}.js`);
        return response.ok ? await response.json() : null;
      } catch (error) {
        return null;
      }
    }

    selectVariant(select) {
      if (!select.value) {
        this.clearSelectedGift();
        return;
      }

      const selectedRadio = this.section.querySelector(
        'input[name^="gift-selection"]:checked'
      );
      if (!selectedRadio) {
        select.value = "";
        return;
      }

      const productCard = select.closest(".gift-product-card");
      const option = select.options[select.selectedIndex];
      const productTitle =
        productCard.querySelector(".gift-card-heading")?.textContent.trim() ||
        "";

      this.selectedGift = {
        variantId: select.value,
        title:
          productTitle +
          (option.dataset.title !== "Default Title"
            ? ` - ${option.dataset.title}`
            : ""),
        price: option.dataset.price,
        image: option.dataset.image,
      };

      this.showSelectedGift();
    }

    startMonitoring() {
      if (this.monitoringActive) return;
      this.monitoringActive = true;

      // Listen to Dawn theme cart events
      if (
        typeof subscribe !== "undefined" &&
        typeof PUB_SUB_EVENTS !== "undefined"
      ) {
        subscribe(PUB_SUB_EVENTS.cartUpdate, this.handleCartUpdate);
      }

      this.attachCartListeners();
    }

    attachCartListeners() {
      const events = [
        { selector: 'form[action*="/cart"]', event: "submit", delay: 500 },
        {
          selector: '.quantity__input, input[name="updates[]"]',
          event: "change",
          delay: 300,
        },
        {
          selector: "cart-remove-button, .cart-remove",
          event: "click",
          delay: 500,
        },
      ];

      events.forEach(({ selector, event, delay }) => {
        document.addEventListener(event, (e) => {
          if (e.target.matches(selector) || e.target.closest(selector)) {
            setTimeout(() => this.updateCartState(), delay);
          }
        });
      });

      // Custom cart events
      ["cart:update", "cart:add"].forEach((eventName) => {
        document.addEventListener(eventName, () => this.updateCartState());
      });
    }

    async handleCartUpdate(event) {
      if (
        event?.source === "free-gift-add" ||
        event?.source === "free-gift-remove"
      ) {
        return;
      }
      await this.updateCartState();
    }

    async updateCartState() {
      const now = Date.now();
      if (now - this.lastUpdateTime < this.updateDebounceTime) {
        return;
      }
      this.lastUpdateTime = now;

      try {
        await this.fetchCartData();
        this.updateDisplay();
      } catch (error) {
        // Silent fail for state updates
      }
    }

    async fetchCartData() {
      const response = await fetch(
        `${window.Shopify?.routes?.root || "/"}cart.js`
      );
      if (!response.ok) throw new Error("Failed to fetch cart data");

      this.cartData = await response.json();
      this.lastCartTotal = this.cartData.total_price;
      return this.cartData;
    }

    updateDisplay() {
      if (!this.cartData) return;

      const states = {
        progress: this.section.querySelector(".gift-state--progress"),
        selector: this.section.querySelector(".gift-state--selector"),
        success: this.section.querySelector(".gift-state--success"),
      };

      const existingGift = this.cartData.items.find(
        (item) => item.properties?._is_free_gift === "true"
      );
      const hasGift = Boolean(existingGift);
      const thresholdMet = this.cartData.total_price >= this.threshold;

      // Remove gift if threshold not met
      if (hasGift && !thresholdMet) {
        this.removeGift();
        return;
      }

      // Hide all states
      Object.values(states).forEach((state) => {
        if (state) {
          state.style.display = "none";
          state.style.visibility = "hidden";
          state.classList.remove("loaded");
        }
      });

      // Show appropriate state
      if (hasGift) {
        this.showSuccessState(states.success);
      } else if (thresholdMet) {
        this.showSelectorState(states.selector);
      } else {
        this.showProgressState(states.progress);
      }
    }

    showProgressState(state) {
      if (!state) return;

      state.style.display = "block";
      state.style.visibility = "visible";
      this.updateProgressDisplay();
    }

    showSelectorState(state) {
      if (!state) return;

      state.style.display = "block";
      state.style.visibility = "visible";
    }

    showSuccessState(state) {
      if (!state) return;

      this.updateSuccessDisplay();
      state.style.display = "block";
      state.style.visibility = "visible";
      state.style.opacity = "1";
      state.classList.add("loaded");
      state.offsetHeight; // Force reflow
    }

    updateProgressDisplay() {
      if (!this.cartData) return;

      const remaining = Math.max(0, this.threshold - this.cartData.total_price);
      const percentage = Math.min(
        (this.cartData.total_price / this.threshold) * 100,
        100
      );

      // Update message
      const messageEl = this.section.querySelector(
        ".gift-state--progress .gift-message"
      );
      if (messageEl) {
        if (this.cartData.total_price === 0) {
          messageEl.textContent =
            "Your cart is empty. Add products to receive a free gift!";
        } else if (remaining > 0) {
          messageEl.innerHTML = `Add products worth <span class="gift-amount">${this.formatMoney(
            remaining
          )}</span> to receive a free gift!`;
        } else {
          messageEl.textContent =
            "Congratulations! You've reached the threshold for a free gift!";
        }
      }

      // Update progress bar
      this.updateProgressBar(percentage);
      this.updateProgressAmounts();
    }

    updateProgressBar(percentage) {
      const progressFill = this.section.querySelector(
        `#progress-fill-${this.sectionId}`
      );
      if (progressFill) {
        progressFill.style.width = `${percentage}%`;
        progressFill.setAttribute("data-progress", percentage.toFixed(1));
      }

      const percentageEl = this.section.querySelector(
        `#progress-percent-${this.sectionId}`
      );
      if (percentageEl) {
        percentageEl.textContent = Math.round(percentage);
      }
    }

    updateProgressAmounts() {
      const currentEl = this.section.querySelector(
        `#progress-current-${this.sectionId}`
      );
      if (currentEl) {
        currentEl.textContent = this.formatMoney(this.cartData.total_price);
      }

      const targetEl = this.section.querySelector(
        `#progress-target-${this.sectionId}`
      );
      if (targetEl) {
        targetEl.textContent = this.formatMoney(this.threshold);
      }
    }

    updateSuccessDisplay() {
      const giftItem = this.cartData.items.find(
        (item) => item.properties?._is_free_gift === "true"
      );

      if (giftItem) {
        const infoEl = this.section.querySelector(".gift-selected-info-text");
        if (infoEl) {
          let title = giftItem.product_title;
          if (
            giftItem.variant_title &&
            giftItem.variant_title !== "Default Title"
          ) {
            title += ` - ${giftItem.variant_title}`;
          }
          infoEl.innerHTML = `Selected gift: <strong>${title}</strong>`;
          infoEl.style.opacity = "1";
        }
      }
    }

    clearSelectedGift() {
      this.selectedGift = null;
      const selectedDiv = this.section.querySelector(".gift-selected");
      if (selectedDiv) {
        selectedDiv.style.display = "none";
      }
    }

    showSelectedGift() {
      const selectedDiv = this.section.querySelector(".gift-selected");
      if (!selectedDiv || !this.selectedGift) return;

      // Update image
      const img = selectedDiv.querySelector(".gift-selected-image");
      if (img && this.selectedGift.image) {
        img.src = this.selectedGift.image;
        img.alt = this.selectedGift.title;
      }

      // Update title
      const titleEl = selectedDiv.querySelector(".gift-selected-title");
      if (titleEl) {
        titleEl.textContent = this.selectedGift.title;
      }

      selectedDiv.style.display = "block";
      selectedDiv.offsetHeight; // Force reflow
      selectedDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async addGiftToCart() {
      if (this.isProcessing || !this.selectedGift) return;

      // Verify threshold is still met
      await this.fetchCartData();
      if (this.cartData.total_price < this.threshold) {
        this.showNotification(
          "Cart does not meet the required threshold",
          "error"
        );
        this.updateDisplay();
        return;
      }

      // Check for existing gift
      const existingGift = this.cartData.items.find(
        (item) => item.properties?._is_free_gift === "true"
      );

      if (existingGift) {
        this.showNotification("Gift is already in cart", "warning");
        return;
      }

      const button = this.section.querySelector(".gift-add-btn");
      if (!button) return;

      this.setButtonLoading(button, true);

      try {
        const formData = {
          items: [
            {
              id: parseInt(this.selectedGift.variantId),
              quantity: 1,
              properties: {
                _is_free_gift: "true",
                _original_price: this.selectedGift.price,
                _threshold_required: this.threshold.toString(),
                _disable_link: "true",
              },
            },
          ],
        };

        const response = await fetch(
          `${window.Shopify?.routes?.root || "/"}cart/add.js`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.description || "Error adding gift");
        }

        this.showNotification("Gift has been added to cart!", "success");
        await this.fetchCartData();
        this.updateDisplay();
        this.publishCartUpdate("free-gift-add");
      } catch (error) {
        this.showNotification(`Cannot add gift: ${error.message}`, "error");
      } finally {
        this.setButtonLoading(button, false);
      }
    }

    async removeGift() {
      const giftItem = this.cartData.items.find(
        (item) => item.properties?._is_free_gift === "true"
      );

      if (!giftItem) return;

      this.section.classList.add("gift-threshold-loading");

      try {
        const response = await fetch(
          `${window.Shopify?.routes?.root || "/"}cart/change.js`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: giftItem.key,
              quantity: 0,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to remove gift");
        }

        const updatedCart = await response.json();
        this.cartData = updatedCart;
        this.lastCartTotal = updatedCart.total_price;

        this.showNotification("Gift removed (cart below threshold)", "warning");
        this.updateCartDisplay(updatedCart);
        this.updateDisplay();
        this.publishCartUpdate("free-gift-remove", updatedCart);
      } catch (error) {
        this.showNotification("Error removing gift", "error");
      } finally {
        this.section.classList.remove("gift-threshold-loading");
      }
    }

    updateCartDisplay(cartData) {
      // Update cart count
      const cartCountBubble = domCache.get(".cart-count-bubble");
      if (cartCountBubble) {
        const count = cartCountBubble.querySelector('span[aria-hidden="true"]');
        if (count) {
          count.textContent = cartData.item_count;
        }
      }

      // Update cart totals on cart page
      if (window.location.pathname.includes("/cart")) {
        const subtotalEl = domCache.get(".totals__subtotal-value");
        if (subtotalEl) {
          subtotalEl.textContent = this.formatMoney(
            cartData.items_subtotal_price
          );
        }

        const totalEl = domCache.get(".totals__total-value");
        if (totalEl) {
          totalEl.textContent = this.formatMoney(cartData.total_price);
        }
      }

      // Update cart drawer if open
      const cartDrawer = domCache.get("cart-drawer");
      if (cartDrawer?.classList.contains("active")) {
        const cartItems = domCache.get("cart-drawer-items");
        if (cartItems?.onCartUpdate) {
          cartItems.onCartUpdate();
        }
      }
    }

    publishCartUpdate(source, cartData = null) {
      if (
        typeof publish !== "undefined" &&
        typeof PUB_SUB_EVENTS !== "undefined"
      ) {
        publish(PUB_SUB_EVENTS.cartUpdate, {
          source,
          cartData: cartData || this.cartData,
          variantId: this.selectedGift?.variantId,
        });
      }
    }

    setButtonLoading(button, loading) {
      this.isProcessing = loading;
      button.setAttribute("aria-busy", loading.toString());
      button.classList.toggle("loading", loading);

      const spinner = button.querySelector(".loading-overlay__spinner");
      if (spinner) {
        spinner.classList.toggle("hidden", !loading);
      }
    }

    formatMoney(cents) {
      if (window.Shopify?.formatMoney && window.theme?.moneyFormat) {
        return window.Shopify.formatMoney(cents, window.theme.moneyFormat);
      }

      // Fallback formatting
      const amount = (cents / 100).toFixed(2);
      const [whole, decimal] = amount.split(".");
      const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      return `${formattedWhole},${decimal} zł`;
    }

    showNotification(message, type = "info") {
      // Remove existing notifications
      document
        .querySelectorAll(".gift-notification")
        .forEach((n) => n.remove());

      const notification = document.createElement("div");
      notification.className = `gift-notification gift-notification--${type}`;
      notification.textContent = message;
      notification.setAttribute("role", "alert");
      notification.setAttribute("aria-live", "polite");
      document.body.appendChild(notification);

      // Auto-remove after 3 seconds
      setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.transform = "translateX(110%)";
        setTimeout(() => notification.remove(), 300);
      }, 3000);

      // Click to dismiss
      notification.addEventListener("click", () => {
        notification.style.opacity = "0";
        setTimeout(() => notification.remove(), 200);
      });
    }

    destroy() {
      this.monitoringActive = false;
      this.section.removeEventListener("change", this.handleSectionChange);
      const addButton = this.section.querySelector(".gift-add-btn");
      if (addButton) {
        addButton.removeEventListener("click", this.handleAddGift);
      }
      domCache.clear();
    }
  }

  // Cart Gift Protection Manager
  class CartGiftProtection {
    constructor() {
      this.isActive = false;
      this.cachedCart = null;
      this.lastProtectionRun = 0;
      this.protectionDebounce = 500;

      this.initialize();
    }

    initialize() {
      if (this.shouldActivate()) {
        this.startProtection();
      }
    }

    shouldActivate() {
      return Boolean(
        document.body.classList.contains("template-cart") ||
          document.querySelector("cart-drawer") ||
          document.querySelector("cart-items")
      );
    }

    startProtection() {
      if (this.isActive) return;
      this.isActive = true;

      this.attachProtectionListeners();
      this.protectGiftQuantities();
    }

    attachProtectionListeners() {
      // Listen to quantity changes
      document.addEventListener("change", (e) => {
        if (e.target.matches(".quantity__input")) {
          setTimeout(() => this.protectGiftQuantities(), 200);
        }
      });

      // Listen to cart updates
      document.addEventListener("cart:update", () => {
        setTimeout(() => this.protectGiftQuantities(), 200);
      });

      // Listen to Dawn's events
      if (
        typeof subscribe !== "undefined" &&
        typeof PUB_SUB_EVENTS !== "undefined"
      ) {
        subscribe(PUB_SUB_EVENTS.cartUpdate, () => {
          setTimeout(() => this.protectGiftQuantities(), 200);
        });
      }
    }

    async protectGiftQuantities() {
      const now = Date.now();
      if (now - this.lastProtectionRun < this.protectionDebounce) {
        return;
      }
      this.lastProtectionRun = now;

      try {
        const response = await fetch(
          `${window.Shopify?.routes?.root || "/"}cart.js`
        );
        const cart = await response.json();

        // Skip if cart hasn't changed
        if (
          JSON.stringify(cart.items) === JSON.stringify(this.cachedCart?.items)
        ) {
          return;
        }
        this.cachedCart = cart;

        this.resetQuantityControls();
        this.disableGiftQuantityControls(cart.items);
      } catch (error) {
        // Silent fail for protection
      }
    }

    resetQuantityControls() {
      document.querySelectorAll(".quantity__input").forEach((input) => {
        const row = input.closest(".cart-item");
        const isGift =
          row?.dataset.isGift === "true" ||
          row?.dataset.isSample === "true" ||
          row?.querySelector(".gift-item-disabled");

        if (!isGift) {
          input.disabled = false;
          input.readOnly = false;

          const container = input.closest("quantity-input");
          if (container) {
            container.querySelectorAll("button").forEach((btn) => {
              btn.disabled = false;
              btn.style.opacity = "";
              btn.style.cursor = "";
            });
          }
        }
      });
    }

    disableGiftQuantityControls(items) {
      items.forEach((item, index) => {
        if (item.properties?._is_free_gift === "true") {
          const input =
            document.querySelector(
              `input[data-quantity-variant-id="${item.variant_id}"]`
            ) || document.querySelector(`#Quantity-${index + 1}`);

          if (input) {
            input.disabled = true;
            input.readOnly = true;
            input.value = 1;

            const container = input.closest("quantity-input");
            if (container) {
              container.querySelectorAll("button").forEach((btn) => {
                btn.disabled = true;
                btn.style.opacity = "0.5";
                btn.style.cursor = "not-allowed";
              });
            }
          }
        }
      });
    }

    destroy() {
      this.isActive = false;
      domCache.clear();
    }
  }

  // Global initialization
  let cartProtection = null;

  // Backward compatibility
  window.protectGiftQuantities = function () {
    if (!cartProtection) {
      cartProtection = new CartGiftProtection();
    } else {
      cartProtection.protectGiftQuantities();
    }
  };

  function initializeGiftManagers() {
    document.querySelectorAll(".free-gift-threshold").forEach((section) => {
      if (section.giftManager) {
        section.giftManager.destroy();
      }
      section.giftManager = new FreeGiftManager(section);
    });

    if (!cartProtection && document.querySelector(".free-gift-threshold")) {
      cartProtection = new CartGiftProtection();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeGiftManagers);
  } else {
    initializeGiftManagers();
  }

  // Handle Shopify section events
  document.addEventListener("shopify:section:load", (event) => {
    const section = event.target.querySelector(".free-gift-threshold");
    if (section) {
      if (section.giftManager) {
        section.giftManager.destroy();
      }
      section.giftManager = new FreeGiftManager(section);
    }
  });

  document.addEventListener("shopify:block:select", (event) => {
    const section = event.target.closest(".free-gift-threshold");
    if (section && !section.giftManager) {
      section.giftManager = new FreeGiftManager(section);
    }
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if (cartProtection) {
      cartProtection.destroy();
    }

    document.querySelectorAll(".free-gift-threshold").forEach((section) => {
      if (section.giftManager) {
        section.giftManager.destroy();
      }
    });
  });
})();
