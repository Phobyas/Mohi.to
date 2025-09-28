/**
 * Free Gift Threshold Manager - Optimized Version with Performance Improvements
 * File: assets/free-gift-threshold.js
 */

(function () {
  // Performance improvements: Cache DOM selectors and reduce global scope pollution
  const DOMCache = {
    cartCountBubble: null,
    cartSubtotal: null,
    cartTotal: null,
    cartDrawer: null,
    cartItems: null,
    init() {
      // Lazy load selectors when needed
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
      // Clear cache to force re-query (useful after DOM updates)
      this.cartCountBubble = null;
      this.cartSubtotal = null;
      this.cartTotal = null;
      this.cartDrawer = null;
      this.cartItems = null;
      return this.init();
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
      this.updateDebounceTime = 100; // Prevent excessive updates
      this.monitoringActive = false;

      // Bind methods to preserve context
      this.handleSectionChange = this.handleSectionChange.bind(this);
      this.handleAddGift = this.handleAddGift.bind(this);
      this.handleCartUpdate = this.handleCartUpdate.bind(this);
      this.debouncedCartCheck = this.debouncedCartCheck.bind(this);

      this.init();
    }

    async init() {
      try {
        // Get initial cart state
        await this.fetchCart();

        // Set up event listeners
        this.attachEventListeners();

        // Start monitoring (only once)
        if (!this.monitoringActive) {
          this.startMonitoring();
        }

        // Initial UI update
        this.updateUI();
      } catch (error) {
        // Silent fail
      }
    }

    attachEventListeners() {
      // Remove existing listeners to prevent duplicates
      this.section.removeEventListener("change", this.handleSectionChange);
      this.section.addEventListener("change", this.handleSectionChange);

      // Add gift button
      const addBtn = this.section.querySelector(".gift-add-btn");
      if (addBtn) {
        addBtn.removeEventListener("click", this.handleAddGift);
        addBtn.addEventListener("click", this.handleAddGift);
      }
    }

    handleSectionChange(e) {
      if (e.target.classList.contains("gift-radio")) {
        this.selectProductByRadio(e.target);
      } else if (e.target.classList.contains("gift-variant-select")) {
        this.selectVariant(e.target);
      }
    }

    handleAddGift() {
      this.addGiftToCart();
    }

    selectProductByRadio(radio) {
      const productCard = radio.closest(".gift-product-card");
      const productId = productCard.dataset.productId;

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

        // Reset variant selection
        const variantSelect = variantSelection.querySelector(
          ".gift-variant-select"
        );
        if (variantSelect) {
          variantSelect.value = "";
        }

        // Don't proceed until variant is chosen
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

        this.showSelectedGift();
      } else {
        // Fallback to API call
        this.getProductVariants(productId)
          .then((product) => {
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
          })
          .catch((error) => {
            // Silent fail
          });
      }
    }

    async getProductVariants(productId) {
      try {
        const response = await fetch(`/products/${productId}.js`);
        if (!response.ok) throw new Error("Failed to fetch product");
        return await response.json();
      } catch (error) {
        return null;
      }
    }

    startMonitoring() {
      if (this.monitoringActive) return;
      this.monitoringActive = true;

      // Listen to Dawn theme cart events if available
      if (
        typeof subscribe !== "undefined" &&
        typeof PUB_SUB_EVENTS !== "undefined"
      ) {
        subscribe(PUB_SUB_EVENTS.cartUpdate, this.handleCartUpdate);
      }

      // Listen to cart form changes
      this.attachCartListeners();
    }

    attachCartListeners() {
      // Listen to cart form submissions
      document.addEventListener("submit", (e) => {
        if (e.target.matches('form[action*="/cart"]')) {
          setTimeout(() => this.debouncedUpdate(), 500);
        }
      });

      // Listen to quantity changes
      document.addEventListener("change", (e) => {
        if (e.target.matches('.quantity__input, input[name="updates[]"]')) {
          setTimeout(() => this.debouncedUpdate(), 300);
        }
      });

      // Listen to remove button clicks
      document.addEventListener("click", (e) => {
        if (e.target.closest("cart-remove-button, .cart-remove")) {
          setTimeout(() => this.debouncedUpdate(), 500);
        }
      });

      // Listen to cart drawer events
      document.addEventListener("cart:update", () => {
        this.debouncedUpdate();
      });

      // Listen to add to cart events
      document.addEventListener("cart:add", () => {
        setTimeout(() => this.debouncedUpdate(), 300);
      });
    }

    async handleCartUpdate(event) {
      // Skip if this update was triggered by our gift manager
      if (
        event?.source === "free-gift-add" ||
        event?.source === "free-gift-remove"
      ) {
        return;
      }

      await this.debouncedUpdate();
    }

    async debouncedUpdate() {
      const now = Date.now();
      if (now - this.lastUpdateTime < this.updateDebounceTime) {
        return; // Skip if updated too recently
      }
      this.lastUpdateTime = now;

      try {
        await this.fetchCart();
        this.updateUI();
      } catch (error) {
        // Silent fail
      }
    }

    async debouncedCartCheck() {
      try {
        const response = await fetch(window.Shopify.routes.root + "cart.js");
        const currentCart = await response.json();

        if (currentCart.total_price !== this.lastCartTotal) {
          this.lastCartTotal = currentCart.total_price;
          this.cartData = currentCart;
          this.updateUI();
        }
      } catch (error) {
        // Silent fail for polling
      }
    }

    async fetchCart() {
      try {
        const response = await fetch(window.Shopify.routes.root + "cart.js");
        if (!response.ok) throw new Error("Failed to fetch cart");

        this.cartData = await response.json();
        this.lastCartTotal = this.cartData.total_price;

        return this.cartData;
      } catch (error) {
        return null;
      }
    }

    updateUI() {
      if (!this.cartData) return;

      const states = {
        progress: this.section.querySelector(".gift-state--progress"),
        selector: this.section.querySelector(".gift-state--selector"),
        success: this.section.querySelector(".gift-state--success"),
      };

      // Check for existing gift
      const giftItem = this.cartData.items.find(
        (item) => item.properties && item.properties._is_free_gift === "true"
      );
      const hasGift = !!giftItem;
      const thresholdMet = this.cartData.total_price >= this.threshold;

      // Check if gift needs to be removed (has gift but threshold not met)
      if (hasGift && !thresholdMet) {
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
          // Update success info BEFORE showing the state
          this.updateSuccessInfo();

          // Then show the state immediately
          states.success.style.display = "block";
          states.success.style.visibility = "visible";
          states.success.style.opacity = "1"; // Force opacity
          states.success.classList.add("loaded");

          // Force a reflow to ensure immediate display
          states.success.offsetHeight;
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
      const giftItem = this.cartData.items.find(
        (item) => item.properties && item.properties._is_free_gift === "true"
      );

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

          // Update the content immediately
          infoEl.innerHTML = `Selected gift: <strong>${title}</strong>`;
          infoEl.style.opacity = "1"; // Force visibility
        }
      }
    }

    selectVariant(select) {
      if (!select.value) {
        this.selectedGift = null;
        this.hideSelectedGift();
        return;
      }

      // Ensure a product is selected
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
      const existingGift = this.cartData.items.find(
        (item) => item.properties && item.properties._is_free_gift === "true"
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
          window.Shopify.routes.root + "cart/add.js",
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
        this.showNotification("Cannot add gift: " + error.message, "error");
      } finally {
        this.setButtonLoading(button, false);
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

    async removeGift() {
      const giftItem = this.cartData.items.find(
        (item) => item.properties && item.properties._is_free_gift === "true"
      );

      if (!giftItem) return;

      this.section.classList.add("gift-threshold-loading");

      try {
        const response = await fetch(
          window.Shopify.routes.root + "cart/change.js",
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
        this.updateCartUI(updatedCart);
        this.updateUI();

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
        this.showNotification("Error removing gift", "error");
      } finally {
        this.section.classList.remove("gift-threshold-loading");
      }
    }

    updateCartUI(cartData) {
      // Use cached selectors for better performance
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

    formatMoney(cents) {
      // Use Shopify's money format if available
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

    // Cleanup method
    destroy() {
      this.monitoringActive = false;
      this.section.removeEventListener("change", this.handleSectionChange);
      const addBtn = this.section.querySelector(".gift-add-btn");
      if (addBtn) {
        addBtn.removeEventListener("click", this.handleAddGift);
      }
    }
  }

  // Optimized Cart Protection Manager - Event-driven
  class CartGiftProtection {
    constructor() {
      this.isActive = false;
      this.cachedCart = null;
      this.lastProtectionRun = 0;
      this.protectionDebounce = 500; // Reduce frequency

      this.init();
    }

    init() {
      // Only initialize if we're on a cart-related page
      if (this.shouldActivate()) {
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

      // Listen to cart events instead of polling
      this.attachProtectionListeners();

      // Initial run
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

    async protectGiftQuantities() {
      const now = Date.now();
      if (now - this.lastProtectionRun < this.protectionDebounce) {
        return; // Skip if run too recently
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

        // Reset all quantity controls first
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

        // Only disable gift items
        cart.items.forEach((item, index) => {
          if (item.properties && item.properties._is_free_gift === "true") {
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
      } catch (error) {
        // Silent fail
      }
    }

    destroy() {
      this.isActive = false;
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
    document.querySelectorAll(".free-gift-threshold").forEach((section) => {
      if (section.giftManager) {
        section.giftManager.destroy(); // Clean up existing
      }
      section.giftManager = new FreeGiftManager(section);
    });

    // Initialize cart protection only if needed
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
