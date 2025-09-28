/**
 * Free Gift Threshold Manager - Conservative Optimization
 * Maintaining all functionality while reducing code size
 */

(function () {
  // Consolidated constants and utilities
  const CONFIG = {
    DEBOUNCE_TIME: 100,
    PROTECTION_DEBOUNCE: 500,
    RETRY_MAX: 3,
    RETRY_DELAY: 500,
  };

  // Enhanced logging utility
  const Logger = {
    enabled:
      window.location.hostname === "localhost" ||
      window.location.search.includes("debug=gift"),

    log(level, message, data = null) {
      if (!this.enabled) return;
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [GIFT-${level.toUpperCase()}] ${message}`;
      if (data) {
        console[level](logMessage, data);
      } else {
        console[level](logMessage);
      }
    },

    debug(message, data) {
      this.log("debug", message, data);
    },
    info(message, data) {
      this.log("info", message, data);
    },
    warn(message, data) {
      this.log("warn", message, data);
    },
    error(message, data) {
      this.log("error", message, data);
    },
  };

  // Performance improvements: Cache DOM selectors
  const DOMCache = {
    cartCountBubble: null,
    cartSubtotal: null,
    cartTotal: null,
    cartDrawer: null,
    cartItems: null,

    init() {
      this.cartCountBubble =
        this.cartCountBubble || document.querySelector(".cart-count-bubble");
      this.cartSubtotal =
        this.cartSubtotal || document.querySelector(".totals__subtotal-value");
      this.cartTotal =
        this.cartTotal || document.querySelector(".totals__total-value");
      this.cartDrawer =
        this.cartDrawer || document.querySelector("cart-drawer");
      this.cartItems =
        this.cartItems || document.querySelector("cart-drawer-items");
      return this;
    },

    refresh() {
      this.cartCountBubble = null;
      this.cartSubtotal = null;
      this.cartTotal = null;
      this.cartDrawer = null;
      this.cartItems = null;
      return this.init();
    },
  };

  // Transaction lock to prevent race conditions
  const TransactionLock = {
    locks: new Set(),
    acquire(key) {
      if (this.locks.has(key)) return false;
      this.locks.add(key);
      return true;
    },
    release(key) {
      this.locks.delete(key);
    },
    isLocked(key) {
      return this.locks.has(key);
    },
  };

  // Enhanced retry utility
  const RetryHelper = {
    async execute(
      fn,
      maxRetries = CONFIG.RETRY_MAX,
      delay = CONFIG.RETRY_DELAY
    ) {
      let lastError;
      for (let i = 0; i <= maxRetries; i++) {
        try {
          const result = await fn();
          if (i > 0) Logger.info(`Operation succeeded after ${i} retries`);
          return result;
        } catch (error) {
          lastError = error;
          Logger.warn(`Attempt ${i + 1} failed:`, error.message);
          if (i < maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, delay * Math.pow(2, i))
            );
          }
        }
      }
      Logger.error(
        `Operation failed after ${maxRetries + 1} attempts:`,
        lastError
      );
      throw lastError;
    },
  };

  class FreeGiftManager {
    constructor(section) {
      this.section = section;
      this.threshold = parseInt(section.dataset.threshold);
      this.sectionId = section.dataset.sectionId;
      this.selectedGift = null;
      this.isProcessing = false;
      this.cartData = null;
      this.lastCartTotal = 0;
      this.lastUpdateTime = 0;
      this.updateDebounceTime = CONFIG.DEBOUNCE_TIME;
      this.monitoringActive = false;
      this.eventListeners = [];

      // Bind methods to preserve context
      this.handleSectionChange = this.handleSectionChange.bind(this);
      this.handleAddGift = this.handleAddGift.bind(this);
      this.handleCartUpdate = this.handleCartUpdate.bind(this);
      this.debouncedCartCheck = this.debouncedCartCheck.bind(this);

      Logger.info(`Initializing FreeGiftManager for section ${this.sectionId}`);
      this.init();
    }

    addEventListenerTracked(element, event, handler, options = {}) {
      element.addEventListener(event, handler, options);
      this.eventListeners.push({ element, event, handler, options });
    }

    removeAllEventListeners() {
      this.eventListeners.forEach(({ element, event, handler, options }) => {
        try {
          element.removeEventListener(event, handler, options);
        } catch (error) {
          Logger.warn("Failed to remove event listener:", error);
        }
      });
      this.eventListeners = [];
    }

    async init() {
      try {
        Logger.debug("Starting initialization");
        await this.fetchCart();
        this.attachEventListeners();
        if (!this.monitoringActive) {
          this.startMonitoring();
        }
        this.updateUI();
        Logger.info("Initialization completed successfully");
      } catch (error) {
        Logger.error("Initialization failed:", error);
      }
    }

    attachEventListeners() {
      this.removeAllEventListeners();
      this.addEventListenerTracked(
        this.section,
        "change",
        this.handleSectionChange
      );

      const addBtn = this.section.querySelector(".gift-add-btn");
      if (addBtn) {
        this.addEventListenerTracked(addBtn, "click", this.handleAddGift);
      }

      Logger.debug("Event listeners attached");
    }

    handleSectionChange(e) {
      Logger.debug("Section change detected:", e.target.className);

      if (e.target.classList.contains("gift-radio")) {
        this.selectProductByRadio(e.target);
      } else if (e.target.classList.contains("gift-variant-select")) {
        this.selectVariant(e.target);
      }
    }

    handleAddGift() {
      Logger.debug("Add gift button clicked");
      this.addGiftToCart();
    }

    selectProductByRadio(radio) {
      const productCard = radio.closest(".gift-product-card");
      const productId = productCard.dataset.productId;

      Logger.debug(`Product selected: ${productId}`);

      // Hide all variant selections first
      this.section
        .querySelectorAll(".gift-variant-selection")
        .forEach((selection) => {
          selection.style.display = "none";
        });

      // Show variant selection for this product if it has variants
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
        this.selectedGift = null;
        this.hideSelectedGift();
        return;
      }

      // For products with single variant, use data attributes
      const productTitle =
        productCard.dataset.productTitle ||
        productCard.querySelector(".gift-card-heading").textContent.trim();
      const productImage =
        productCard.dataset.productImage ||
        productCard.querySelector(".gift-card-media img")?.src ||
        "";
      const firstVariantId = productCard.dataset.firstVariantId;
      const firstVariantPrice = productCard.dataset.firstVariantPrice;

      if (firstVariantId && firstVariantPrice) {
        this.selectedGift = {
          variantId: firstVariantId,
          title: productTitle,
          price: firstVariantPrice,
          image: productImage,
        };
        Logger.debug("Gift selected from data attributes:", this.selectedGift);
        this.showSelectedGift();
      } else {
        // Fallback to API call with retry
        Logger.debug("Fetching product variants from API");
        RetryHelper.execute(() => this.getProductVariants(productId))
          .then((product) => {
            if (product?.variants?.length > 0) {
              const firstVariant = product.variants[0];
              this.selectedGift = {
                variantId: firstVariant.id,
                title: productTitle,
                price: firstVariant.price,
                image: productImage,
              };
              Logger.debug("Gift selected from API:", this.selectedGift);
              this.showSelectedGift();
            }
          })
          .catch((error) => {
            Logger.error("Failed to fetch product variants:", error);
          });
      }
    }

    async getProductVariants(productId) {
      const response = await fetch(`/products/${productId}.js`);
      if (!response.ok)
        throw new Error(`Failed to fetch product: ${response.status}`);
      return await response.json();
    }

    startMonitoring() {
      if (this.monitoringActive) return;
      this.monitoringActive = true;

      Logger.debug("Starting cart monitoring");

      // Listen to Dawn theme cart events if available
      if (
        typeof subscribe !== "undefined" &&
        typeof PUB_SUB_EVENTS !== "undefined"
      ) {
        subscribe(PUB_SUB_EVENTS.cartUpdate, this.handleCartUpdate);
      }

      this.attachCartListeners();
    }

    attachCartListeners() {
      // Listen to cart form submissions
      this.addEventListenerTracked(document, "submit", (e) => {
        if (e.target.matches('form[action*="/cart"]')) {
          Logger.debug("Cart form submitted");
          setTimeout(() => this.debouncedUpdate(), 500);
        }
      });

      // Listen to quantity changes
      this.addEventListenerTracked(document, "change", (e) => {
        if (e.target.matches('.quantity__input, input[name="updates[]"]')) {
          Logger.debug("Quantity changed");
          setTimeout(() => this.debouncedUpdate(), 300);
        }
      });

      // Listen to remove button clicks
      this.addEventListenerTracked(document, "click", (e) => {
        if (e.target.closest("cart-remove-button, .cart-remove")) {
          Logger.debug("Remove button clicked");
          setTimeout(() => this.debouncedUpdate(), 500);
        }
      });

      // Listen to cart drawer events
      this.addEventListenerTracked(document, "cart:update", () => {
        Logger.debug("Cart update event received");
        this.debouncedUpdate();
      });

      // Listen to add to cart events
      this.addEventListenerTracked(document, "cart:add", () => {
        Logger.debug("Cart add event received");
        setTimeout(() => this.debouncedUpdate(), 300);
      });
    }

    async handleCartUpdate(event) {
      // Skip if this update was triggered by our gift manager
      if (
        event?.source === "free-gift-add" ||
        event?.source === "free-gift-remove"
      ) {
        Logger.debug("Skipping self-triggered cart update");
        return;
      }
      Logger.debug("Handling external cart update");
      await this.debouncedUpdate();
    }

    async debouncedUpdate() {
      const now = Date.now();
      if (now - this.lastUpdateTime < this.updateDebounceTime) {
        Logger.debug("Update debounced - too recent");
        return;
      }
      this.lastUpdateTime = now;

      try {
        await this.fetchCart();
        this.updateUI();
      } catch (error) {
        Logger.error("Debounced update failed:", error);
      }
    }

    async debouncedCartCheck() {
      try {
        const response = await fetch(window.Shopify.routes.root + "cart.js");
        const currentCart = await response.json();

        if (currentCart.total_price !== this.lastCartTotal) {
          this.lastCartTotal = currentCart.total_price;
          this.cartData = currentCart;
          Logger.debug("Cart total changed, updating UI");
          this.updateUI();
        }
      } catch (error) {
        Logger.warn("Cart polling failed:", error);
      }
    }

    async fetchCart() {
      const response = await fetch(window.Shopify.routes.root + "cart.js");
      if (!response.ok)
        throw new Error(`Failed to fetch cart: ${response.status}`);

      this.cartData = await response.json();
      this.lastCartTotal = this.cartData.total_price;

      Logger.debug("Cart fetched:", {
        total: this.cartData.total_price,
        items: this.cartData.items.length,
      });

      return this.cartData;
    }

    updateUI() {
      if (!this.cartData) return;

      const states = {
        progress: this.section.querySelector(".gift-state--progress"),
        selector: this.section.querySelector(".gift-state--selector"),
        success: this.section.querySelector(".gift-state--success"),
      };

      // Consolidated gift detection
      const giftItem = this.findGiftInCart();
      const hasGift = !!giftItem;
      const thresholdMet = this.cartData.total_price >= this.threshold;

      Logger.debug("UI update:", {
        hasGift,
        thresholdMet,
        threshold: this.threshold,
      });

      // Check if gift needs to be removed (has gift but threshold not met)
      if (hasGift && !thresholdMet) {
        Logger.info("Gift needs removal - threshold not met");
        this.removeGift();
        return;
      }

      // Hide all states first
      Object.values(states).forEach((state) => {
        if (state) {
          state.style.display = "none";
          state.style.visibility = "hidden";
          state.classList.remove("loaded");
        }
      });

      // Show appropriate state with immediate visibility
      if (hasGift) {
        if (states.success) {
          this.updateSuccessInfo();
          states.success.style.display = "block";
          states.success.style.visibility = "visible";
          states.success.style.opacity = "1";
          states.success.classList.add("loaded");
          states.success.offsetHeight; // Force reflow
        }
      } else if (thresholdMet) {
        if (states.selector) {
          states.selector.style.display = "block";
          states.selector.style.visibility = "visible";
        }
      } else {
        if (states.progress) {
          states.progress.style.display = "block";
          states.progress.style.visibility = "visible";
          this.updateProgress();
        }
      }
    }

    // Consolidated gift detection method
    findGiftInCart() {
      return this.cartData.items.find(
        (item) =>
          item.properties &&
          (item.properties._is_free_gift === "true" ||
            item.properties._is_free_sample === "true")
      );
    }

    updateProgress() {
      if (!this.cartData) return;

      const remaining = Math.max(0, this.threshold - this.cartData.total_price);
      const percentage = Math.min(
        (this.cartData.total_price / this.threshold) * 100,
        100
      );

      // Update gift message
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
      const progressFill = this.section.querySelector(
        `#progress-fill-${this.sectionId}`
      );
      if (progressFill) {
        progressFill.style.width = percentage + "%";
        progressFill.setAttribute("data-progress", percentage.toFixed(1));
      }

      // Update amounts
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

      const percentageEl = this.section.querySelector(
        `#progress-percent-${this.sectionId}`
      );
      if (percentageEl) {
        percentageEl.textContent = Math.round(percentage);
      }
    }

    updateSuccessInfo() {
      const giftItem = this.findGiftInCart();

      if (giftItem) {
        const infoEl = this.section.querySelector(".gift-selected-info-text");
        if (infoEl) {
          let title = giftItem.product_title;
          if (
            giftItem.variant_title &&
            giftItem.variant_title !== "Default Title"
          ) {
            title += " - " + giftItem.variant_title;
          }
          infoEl.innerHTML = `Selected gift: <strong>${title}</strong>`;
          infoEl.style.opacity = "1";
        }
      }
    }

    selectVariant(select) {
      if (!select.value) {
        this.selectedGift = null;
        this.hideSelectedGift();
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
      const productTitle = productCard
        .querySelector(".gift-card-heading")
        .textContent.trim();

      this.selectedGift = {
        variantId: select.value,
        title:
          productTitle +
          (option.dataset.title !== "Default Title"
            ? " - " + option.dataset.title
            : ""),
        price: option.dataset.price,
        image: option.dataset.image,
      };

      Logger.debug("Variant selected:", this.selectedGift);
      this.showSelectedGift();
    }

    hideSelectedGift() {
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

      // Show with smooth animation
      selectedDiv.style.display = "block";
      selectedDiv.offsetHeight; // Force reflow
      selectedDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async addGiftToCart() {
      if (this.isProcessing || !this.selectedGift) return;

      const lockKey = "add-gift";
      if (!TransactionLock.acquire(lockKey)) {
        Logger.warn("Add gift operation already in progress");
        return;
      }

      try {
        Logger.info("Starting add gift to cart operation");

        // Security check - verify threshold is met
        await this.fetchCart();
        if (this.cartData.total_price < this.threshold) {
          this.showNotification(
            "Cart does not meet the required threshold",
            "error"
          );
          this.updateUI();
          return;
        }

        // Check if gift already exists
        const existingGift = this.findGiftInCart();
        if (existingGift) {
          this.showNotification("Gift is already in cart", "warning");
          return;
        }

        const button = this.section.querySelector(".gift-add-btn");
        if (!button) return;

        this.setButtonLoading(button, true);

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

        await RetryHelper.execute(async () => {
          const response = await fetch(
            window.Shopify.routes.root + "cart/add.js",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(formData),
            }
          );

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.description || `HTTP ${response.status}`);
          }
          return response.json();
        });

        this.showNotification("Gift has been added to cart!", "success");
        Logger.info("Gift successfully added to cart");

        // Refresh cart data and update UI immediately
        await this.fetchCart();
        this.updateUI();

        // Trigger cart update event
        if (
          typeof publish !== "undefined" &&
          typeof PUB_SUB_EVENTS !== "undefined"
        ) {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: "free-gift-add" });
        }
      } catch (error) {
        Logger.error("Failed to add gift to cart:", error);
        this.showNotification("Cannot add gift: " + error.message, "error");
      } finally {
        const button = this.section.querySelector(".gift-add-btn");
        if (button) this.setButtonLoading(button, false);
        TransactionLock.release(lockKey);
      }
    }

    setButtonLoading(button, loading) {
      this.isProcessing = loading;
      button.setAttribute("aria-busy", loading.toString());
      button.classList.toggle("loading", loading);

      const span = button.querySelector("span");
      const spinner = button.querySelector(".loading-overlay__spinner");

      if (loading) {
        if (!button.dataset.originalText) {
          button.dataset.originalText = span.textContent;
        }
        span.textContent = "Dodawanie...";
        spinner?.classList.remove("hidden");
      } else {
        if (button.dataset.originalText) {
          span.textContent = button.dataset.originalText;
        }
        spinner?.classList.add("hidden");
      }
    }

    async removeGift() {
      const lockKey = "remove-gift";
      if (!TransactionLock.acquire(lockKey)) {
        Logger.warn("Remove gift operation already in progress");
        return;
      }

      try {
        const giftItem = this.findGiftInCart();
        if (!giftItem) return;

        Logger.info("Removing gift from cart");
        this.section.classList.add("gift-threshold-loading");

        const updatedCart = await RetryHelper.execute(async () => {
          const response = await fetch(
            window.Shopify.routes.root + "cart/change.js",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: giftItem.key, quantity: 0 }),
            }
          );

          if (!response.ok) {
            throw new Error(`Failed to remove gift: ${response.status}`);
          }
          return response.json();
        });

        this.cartData = updatedCart;
        this.lastCartTotal = updatedCart.total_price;

        this.showNotification("Gift removed (cart below threshold)", "warning");
        this.updateCartUI(updatedCart);
        this.updateUI();

        Logger.info("Gift successfully removed from cart");

        // Trigger cart update event
        if (
          typeof publish !== "undefined" &&
          typeof PUB_SUB_EVENTS !== "undefined"
        ) {
          publish(PUB_SUB_EVENTS.cartUpdate, {
            source: "free-gift-remove",
            cartData: updatedCart,
          });
        }
      } catch (error) {
        Logger.error("Failed to remove gift:", error);
        this.showNotification("Error removing gift", "error");
      } finally {
        this.section.classList.remove("gift-threshold-loading");
        TransactionLock.release(lockKey);
      }
    }

    updateCartUI(cartData) {
      DOMCache.init();

      // Update cart count
      if (DOMCache.cartCountBubble) {
        const count = DOMCache.cartCountBubble.querySelector(
          'span[aria-hidden="true"]'
        );
        if (count) {
          count.textContent = cartData.item_count;
        }
      }

      // Update cart totals if on cart page
      if (window.location.pathname.includes("/cart")) {
        if (DOMCache.cartSubtotal) {
          DOMCache.cartSubtotal.textContent = this.formatMoney(
            cartData.items_subtotal_price
          );
        }
        if (DOMCache.cartTotal) {
          DOMCache.cartTotal.textContent = this.formatMoney(
            cartData.total_price
          );
        }
      }

      // Update cart drawer if open
      if (DOMCache.cartDrawer?.classList.contains("active")) {
        if (DOMCache.cartItems?.onCartUpdate) {
          DOMCache.cartItems.onCartUpdate();
        }
      }
    }

    // Enhanced money formatting
    formatMoney(cents) {
      if (window.Shopify?.formatMoney) {
        const format =
          window.theme?.moneyFormat ||
          window.Shopify.money_format ||
          "{{amount_with_comma_separator}} zł";
        return window.Shopify.formatMoney(cents, format);
      }

      try {
        const amount = (cents / 100).toFixed(2);
        const [whole, decimal] = amount.split(".");
        const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        return `${formattedWhole},${decimal} zł`;
      } catch (error) {
        Logger.error("Money formatting failed:", error);
        return `${(cents / 100).toFixed(2)} zł`;
      }
    }

    showNotification(message, type = "info") {
      Logger.info(`Showing notification: ${type} - ${message}`);

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
      Logger.info(`Destroying FreeGiftManager for section ${this.sectionId}`);
      this.monitoringActive = false;
      this.removeAllEventListeners();
      this.isProcessing = false;
      TransactionLock.release("add-gift");
      TransactionLock.release("remove-gift");
    }
  }

  // Optimized Cart Protection Manager
  class CartGiftProtection {
    constructor() {
      this.isActive = false;
      this.cachedCart = null;
      this.lastProtectionRun = 0;
      this.protectionDebounce = CONFIG.PROTECTION_DEBOUNCE;
      this.eventListeners = [];
      this.init();
    }

    addEventListenerTracked(element, event, handler, options = {}) {
      element.addEventListener(event, handler, options);
      this.eventListeners.push({ element, event, handler, options });
    }

    removeAllEventListeners() {
      this.eventListeners.forEach(({ element, event, handler, options }) => {
        try {
          element.removeEventListener(event, handler, options);
        } catch (error) {
          Logger.warn("Failed to remove protection event listener:", error);
        }
      });
      this.eventListeners = [];
    }

    init() {
      if (this.shouldActivate()) {
        Logger.debug("Activating cart gift protection");
        this.startProtection();
      }
    }

    shouldActivate() {
      return (
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
      this.addEventListenerTracked(document, "change", (e) => {
        if (e.target.matches(".quantity__input")) {
          setTimeout(() => this.protectGiftQuantities(), 200);
        }
      });

      // Listen to cart updates
      this.addEventListenerTracked(document, "cart:update", () => {
        setTimeout(() => this.protectGiftQuantities(), 200);
      });

      // Listen to Dawn's PUB_SUB_EVENTS if available
      if (
        typeof subscribe !== "undefined" &&
        typeof PUB_SUB_EVENTS !== "undefined"
      ) {
        subscribe(PUB_SUB_EVENTS.cartUpdate, () => {
          setTimeout(() => this.protectGiftQuantities(), 200);
        });
      }
    }

    isGiftItem(item, cartRow = null) {
      // Primary detection: cart data properties
      if (item && item.properties) {
        return (
          item.properties._is_free_gift === "true" ||
          item.properties._is_free_sample === "true"
        );
      }

      // Secondary detection: DOM attributes
      if (cartRow) {
        return (
          cartRow.dataset.isGift === "true" ||
          cartRow.dataset.isSample === "true" ||
          cartRow.querySelector(".gift-item-disabled")
        );
      }

      return false;
    }

    async protectGiftQuantities() {
      const now = Date.now();
      if (now - this.lastProtectionRun < this.protectionDebounce) {
        return;
      }
      this.lastProtectionRun = now;

      try {
        const response = await fetch(window.Shopify.routes.root + "cart.js");
        const cart = await response.json();

        // Only update if cart has changed
        if (
          JSON.stringify(cart.items) === JSON.stringify(this.cachedCart?.items)
        ) {
          return;
        }
        this.cachedCart = cart;

        Logger.debug(
          "Protecting gift quantities for",
          cart.items.length,
          "items"
        );

        // Reset all quantity controls first
        document.querySelectorAll(".quantity__input").forEach((input) => {
          const row = input.closest(".cart-item");
          if (!this.isGiftItem(null, row)) {
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

        // Only disable gift items using cart data
        cart.items.forEach((item, index) => {
          if (this.isGiftItem(item)) {
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

              Logger.debug("Protected gift item quantity:", item.product_title);
            }
          }
        });
      } catch (error) {
        Logger.warn("Gift protection failed:", error);
      }
    }

    destroy() {
      Logger.debug("Destroying cart gift protection");
      this.isActive = false;
      this.removeAllEventListeners();
    }
  }

  // Initialize protection manager
  let cartProtection = null;

  // Global functions for backward compatibility
  window.protectGiftQuantities = function () {
    if (!cartProtection) {
      cartProtection = new CartGiftProtection();
    } else {
      cartProtection.protectGiftQuantities();
    }
  };

  // Initialize gift managers
  function initGiftThreshold() {
    Logger.info("Initializing gift threshold system");

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

  // DOM ready initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGiftThreshold);
  } else {
    initGiftThreshold();
  }

  // Shopify section events
  document.addEventListener("shopify:section:load", (event) => {
    const section = event.target.querySelector(".free-gift-threshold");
    if (section) {
      Logger.info("Section loaded, reinitializing gift manager");
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

  window.addEventListener("beforeunload", () => {
    Logger.info("Page unloading, cleaning up gift managers");
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
