/**
 * Free Gift Threshold Manager - Dawn Theme Compatible with Fixed Money Format
 * File: assets/free-gift-threshold.js
 */

(function () {
  class FreeGiftManager {
    constructor(section) {
      this.section = section;
      this.threshold = parseInt(section.dataset.threshold);
      this.sectionId = section.dataset.sectionId;
      this.selectedGift = null;
      this.isProcessing = false;
      this.cartData = null;

      this.init();
    }

    async init() {
      // Get initial cart state
      await this.fetchCart();

      // Set up event listeners
      this.attachEventListeners();

      // Monitor cart changes
      this.monitorCartChanges();

      // Initial UI update
      this.updateUI();
    }

    attachEventListeners() {
      // Radio button selection for products
      this.section.addEventListener("change", (e) => {
        if (e.target.classList.contains("gift-radio")) {
          this.selectProductByRadio(e.target);
        }

        // Variant selection
        if (e.target.classList.contains("gift-variant-select")) {
          this.selectVariant(e.target);
        }
      });

      // Add gift button
      const addBtn = this.section.querySelector(".gift-add-btn");
      if (addBtn) {
        addBtn.addEventListener("click", () => this.addGiftToCart());
      }
    }

    selectProductByRadio(radio) {
      const productCard = radio.closest(".gift-product-card");
      const productId = productCard.dataset.productId;

      console.log("Product selected:", productId);

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
        console.log("Product has variants, showing selection");
        variantSelection.style.display = "block";

        // Reset variant selection
        const variantSelect = variantSelection.querySelector(
          ".gift-variant-select"
        );
        if (variantSelect) {
          variantSelect.value = "";
        }

        // Don't proceed with gift selection until variant is chosen
        this.selectedGift = null;
        this.hideSelectedGift();
        return;
      }

      // For products with single variant, use data attributes for immediate selection
      const productTitle =
        productCard.dataset.productTitle ||
        productCard.querySelector(".gift-card-heading").textContent.trim();
      const productImage =
        productCard.dataset.productImage ||
        (productCard.querySelector(".gift-card-media img")
          ? productCard.querySelector(".gift-card-media img").src
          : "");
      const firstVariantId = productCard.dataset.firstVariantId;
      const firstVariantPrice = productCard.dataset.firstVariantPrice;

      console.log("Using data attributes:", {
        title: productTitle,
        image: productImage,
        variantId: firstVariantId,
        price: firstVariantPrice,
      });

      if (firstVariantId && firstVariantPrice) {
        this.selectedGift = {
          variantId: firstVariantId,
          title: productTitle,
          price: firstVariantPrice,
          image: productImage,
        };

        console.log(
          "Selected gift set from data attributes:",
          this.selectedGift
        );
        this.showSelectedGift();
      } else {
        console.error("Missing variant data in product card attributes");

        // Fallback to API call if data attributes are missing
        this.getProductVariants(productId)
          .then((product) => {
            if (product && product.variants && product.variants.length > 0) {
              const firstVariant = product.variants[0];

              this.selectedGift = {
                variantId: firstVariant.id,
                title: productTitle,
                price: firstVariant.price,
                image: productImage,
              };

              console.log(
                "Selected gift set from API fallback:",
                this.selectedGift
              );
              this.showSelectedGift();
            }
          })
          .catch((error) => {
            console.error("API fallback also failed:", error);
          });
      }
    }

    async getProductVariants(productId) {
      try {
        const response = await fetch(`/products/${productId}.js`);
        return await response.json();
      } catch (error) {
        console.error("Error fetching product variants:", error);
        return null;
      }
    }

    monitorCartChanges() {
      // Listen to Dawn theme cart events if available
      if (
        typeof subscribe !== "undefined" &&
        typeof PUB_SUB_EVENTS !== "undefined"
      ) {
        subscribe(PUB_SUB_EVENTS.cartUpdate, async (event) => {
          // Skip if this update was triggered by our gift manager
          if (
            event.source === "free-gift-add" ||
            event.source === "free-gift-remove"
          ) {
            return;
          }

          // Fetch fresh cart data and update UI
          await this.fetchCart();
          this.updateUI();
        });
      }

      // Intercept cart API calls
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch.apply(window, args);
        const url = args[0];

        if (
          typeof url === "string" &&
          (url.includes("/cart/add") ||
            url.includes("/cart/update") ||
            url.includes("/cart/change") ||
            url.includes("/cart/clear"))
        ) {
          // Skip if it's our own request
          const body = args[1]?.body;
          if (body && body.includes("_is_free_gift")) {
            return response;
          }

          // Wait a bit for cart to update, then refresh UI
          setTimeout(async () => {
            await this.fetchCart();
            this.updateUI();
          }, 200);
        }

        return response;
      };

      // Listen for quantity changes in cart
      document.addEventListener("change", async (e) => {
        if (e.target.matches('[name="updates[]"], .quantity__input')) {
          setTimeout(async () => {
            await this.fetchCart();
            this.updateUI();
          }, 300);
        }
      });

      // Listen for remove button clicks
      document.addEventListener("click", async (e) => {
        if (
          e.target.closest(
            'cart-remove-button, [href*="/cart/change"], .cart-item__remove'
          )
        ) {
          setTimeout(async () => {
            await this.fetchCart();
            this.updateUI();
          }, 300);
        }
      });

      // Additional monitoring for cart changes
      let lastCartTotal = this.cartData?.total_price || 0;

      // Poll for cart changes every 2 seconds as backup
      setInterval(async () => {
        const currentCart = await this.fetchCart();
        if (currentCart && currentCart.total_price !== lastCartTotal) {
          lastCartTotal = currentCart.total_price;
          this.updateUI();
        }
      }, 2000);
    }

    async fetchCart() {
      try {
        const response = await fetch(window.Shopify.routes.root + "cart.js");
        this.cartData = await response.json();

        // Store globally for quantity protection
        window.cartData = this.cartData;

        // Protect quantities after cart fetch
        setTimeout(() => {
          window.protectGiftQuantities && window.protectGiftQuantities();
        }, 100);

        return this.cartData;
      } catch (error) {
        console.error("Error fetching cart:", error);
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

      // Determine current state
      const thresholdMet = this.cartData.total_price >= this.threshold;

      // Check if gift needs to be removed (has gift but threshold not met)
      if (hasGift && !thresholdMet) {
        // Don't update UI yet, wait for gift removal
        this.removeGift();
        return;
      }

      // Hide all states
      Object.values(states).forEach((state) => {
        if (state) state.style.display = "none";
      });

      // Show appropriate state
      if (hasGift) {
        if (states.success) {
          states.success.style.display = "block";
          this.updateSuccessInfo();
        }
      } else if (thresholdMet) {
        if (states.selector) {
          states.selector.style.display = "block";
        }
      } else {
        if (states.progress) {
          states.progress.style.display = "block";
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

      console.log("UpdateProgress called:", {
        cartTotal: this.cartData.total_price,
        threshold: this.threshold,
        percentage: percentage,
        sectionId: this.sectionId,
      });

      // Update gift message with remaining amount using consistent formatting
      const messageEl = this.section.querySelector(
        ".gift-state--progress .gift-message"
      );
      if (messageEl) {
        if (this.cartData.total_price === 0) {
          messageEl.textContent =
            "Koszyk jest pusty. Dodaj produkty aby otrzymać darmowy prezent!";
        } else if (remaining > 0) {
          messageEl.innerHTML = `Dodaj produkty za <span class="gift-amount">${this.formatMoney(
            remaining
          )}</span> aby otrzymać darmowy prezent!`;
        } else {
          messageEl.textContent =
            "Gratulacje! Osiągnąłeś próg dla darmowego prezentu!";
        }
      }

      // Update progress bar fill - NEW TARGETING
      const progressFill = this.section.querySelector(
        `#progress-fill-${this.sectionId}`
      );
      if (progressFill) {
        console.log(
          "Found progress fill element, updating to:",
          percentage + "%"
        );
        progressFill.style.width = percentage + "%";
        progressFill.setAttribute("data-progress", percentage.toFixed(1));
      } else {
        console.error(
          "Progress fill element not found:",
          `#progress-fill-${this.sectionId}`
        );
      }

      // Update current amount display
      const currentEl = this.section.querySelector(
        `#progress-current-${this.sectionId}`
      );
      if (currentEl) {
        currentEl.textContent = this.formatMoney(this.cartData.total_price);
        console.log(
          "Updated current amount:",
          this.formatMoney(this.cartData.total_price)
        );
      }

      // Update target amount display
      const targetEl = this.section.querySelector(
        `#progress-target-${this.sectionId}`
      );
      if (targetEl) {
        targetEl.textContent = this.formatMoney(this.threshold);
      }

      // Update percentage text
      const percentageEl = this.section.querySelector(
        `#progress-percent-${this.sectionId}`
      );
      if (percentageEl) {
        percentageEl.textContent = Math.round(percentage);
        console.log("Updated percentage text:", Math.round(percentage) + "%");
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
          infoEl.innerHTML = `Wybrany prezent: <strong>${title}</strong>`;
        }
      }
    }

    selectProduct(button) {
      // Clear previous selections
      this.section.querySelectorAll(".gift-product-card").forEach((card) => {
        card.classList.remove("selected");
      });

      // Mark as selected
      const card = button.closest(".gift-product-card");
      card.classList.add("selected");

      // Store selection
      this.selectedGift = {
        variantId: button.dataset.variantId,
        title: button.dataset.title,
        price: button.dataset.price,
        image: button.dataset.image,
      };

      this.showSelectedGift();
    }

    selectVariant(select) {
      if (!select.value) {
        this.selectedGift = null;
        this.hideSelectedGift();
        return;
      }

      // Get the selected radio button to ensure a product is selected
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

      // Store selection
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

      console.log("Showing selected gift:", this.selectedGift);

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

      // Show the selected div with animation
      selectedDiv.style.display = "block";

      // Force a reflow to ensure the display change takes effect
      selectedDiv.offsetHeight;

      // Scroll into view smoothly
      selectedDiv.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });

      console.log("Selected gift display should now be visible");
    }

    async addGiftToCart() {
      if (this.isProcessing || !this.selectedGift) return;

      // Security check - verify threshold is met
      await this.fetchCart();
      if (this.cartData.total_price < this.threshold) {
        this.showNotification("Koszyk nie spełnia wymaganego progu", "error");
        this.updateUI();
        return;
      }

      // Check if gift already exists
      const existingGift = this.cartData.items.find(
        (item) => item.properties && item.properties._is_free_gift === "true"
      );

      if (existingGift) {
        this.showNotification("Prezent jest już w koszyku", "warning");
        return;
      }

      const button = this.section.querySelector(".gift-add-btn");
      if (!button) return;

      this.isProcessing = true;
      button.setAttribute("aria-busy", "true");
      button.classList.add("loading");

      // Show spinner
      const spinner = button.querySelector(".loading-overlay__spinner");
      if (spinner) {
        spinner.classList.remove("hidden");
      }

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
              },
            },
          ],
        };

        const response = await fetch(
          window.Shopify.routes.root + "cart/add.js",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(formData),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.description || "Błąd dodawania prezentu");
        }

        // Show success
        this.showNotification("Prezent został dodany do koszyka!", "success");

        // Refresh cart
        await this.fetchCart();
        this.updateUI();

        // Trigger cart update event if available
        if (
          typeof publish !== "undefined" &&
          typeof PUB_SUB_EVENTS !== "undefined"
        ) {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: "free-gift-add" });
        }
      } catch (error) {
        console.error("Error adding gift:", error);
        this.showNotification(
          "Nie można dodać prezentu: " + error.message,
          "error"
        );
      } finally {
        this.isProcessing = false;
        button.setAttribute("aria-busy", "false");
        button.classList.remove("loading");

        // Hide spinner
        if (spinner) {
          spinner.classList.add("hidden");
        }
      }
    }

    async removeGift() {
      const giftItem = this.cartData.items.find(
        (item) => item.properties && item.properties._is_free_gift === "true"
      );

      if (!giftItem) return;

      // Show loading state on section
      this.section.classList.add("gift-threshold-loading");

      try {
        const response = await fetch(
          window.Shopify.routes.root + "cart/change.js",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
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

        this.showNotification(
          "Prezent został usunięty (koszyk poniżej progu)",
          "warning"
        );

        // Update local cart data
        this.cartData = updatedCart;

        // Update cart UI without page refresh
        this.updateCartUI(updatedCart);

        // Update gift section UI
        this.updateUI();

        // Trigger Dawn theme cart update if available
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
        console.error("Error removing gift:", error);
        this.showNotification("Błąd podczas usuwania prezentu", "error");
      } finally {
        this.section.classList.remove("gift-threshold-loading");
      }
    }

    updateCartUI(cartData) {
      // Update cart count in header if exists
      const cartCount = document.querySelector(".cart-count-bubble");
      if (cartCount) {
        const count = cartCount.querySelector('span[aria-hidden="true"]');
        if (count) {
          count.textContent = cartData.item_count;
        }
      }

      // Update cart items if on cart page
      if (window.location.pathname.includes("/cart")) {
        // Update cart totals
        const cartSubtotal = document.querySelector(".totals__subtotal-value");
        if (cartSubtotal) {
          cartSubtotal.textContent = this.formatMoney(
            cartData.items_subtotal_price
          );
        }

        const cartTotal = document.querySelector(".totals__total-value");
        if (cartTotal) {
          cartTotal.textContent = this.formatMoney(cartData.total_price);
        }

        // Remove gift item row from cart table
        const giftItem = cartData.items.find(
          (item) => item.properties && item.properties._is_free_gift === "true"
        );

        if (!giftItem) {
          // Gift was removed, find and remove its row
          const cartRows = document.querySelectorAll(".cart-item");
          cartRows.forEach((row) => {
            const titleElement = row.querySelector(".cart-item__name");
            if (titleElement && titleElement.textContent.includes("PREZENT:")) {
              row.style.opacity = "0";
              row.style.transition = "opacity 0.3s ease";
              setTimeout(() => {
                row.remove();
                // Update row indices
                this.updateCartRowIndices();
              }, 300);
            }
          });
        }
      }

      // Update cart drawer if open
      const cartDrawer = document.querySelector("cart-drawer");
      if (cartDrawer && cartDrawer.classList.contains("active")) {
        // Trigger cart drawer refresh
        const cartDrawerItems = document.querySelector("cart-drawer-items");
        if (cartDrawerItems && cartDrawerItems.onCartUpdate) {
          cartDrawerItems.onCartUpdate();
        }
      }
    }

    updateCartRowIndices() {
      // Re-index cart items after removal
      const cartItems = document.querySelectorAll(".cart-item");
      cartItems.forEach((item, index) => {
        const newIndex = index + 1;
        // Update IDs
        if (item.id) {
          item.id = item.id.replace(/\d+$/, newIndex);
        }
        // Update quantity input data-index
        const quantityInput = item.querySelector(".quantity__input");
        if (quantityInput) {
          quantityInput.dataset.index = newIndex;
        }
        // Update remove button data-index
        const removeButton = item.querySelector("cart-remove-button");
        if (removeButton) {
          removeButton.dataset.index = newIndex;
        }
      });
    }

    // Fixed money formatting to match theme format (1.260,00 zł)
    formatMoney(cents) {
      // Use Shopify's money format if available with theme format
      if (
        window.Shopify &&
        window.Shopify.formatMoney &&
        window.theme?.moneyFormat
      ) {
        return window.Shopify.formatMoney(cents, window.theme.moneyFormat);
      }

      // Fallback formatting that matches your theme: 1.260,00 zł
      const amount = (cents / 100).toFixed(2);
      const [whole, decimal] = amount.split(".");

      // Add thousands separators (dots)
      const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

      // Use comma for decimal separator and add currency
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
  }

  // Simple function to disable quantity controls for gift items
  window.protectGiftQuantities = function () {
    fetch(window.Shopify.routes.root + "cart.js")
      .then((response) => response.json())
      .then((cart) => {
        cart.items.forEach((item, index) => {
          if (item.properties && item.properties._is_free_gift === "true") {
            // Find quantity input by variant ID or index
            let input =
              document.querySelector(
                `input[data-quantity-variant-id="${item.variant_id}"]`
              ) || document.querySelector(`#Quantity-${index + 1}`);

            if (input) {
              // Disable input
              input.disabled = true;
              input.readOnly = true;
              input.value = 1;

              // Disable buttons in the same container
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
      })
      .catch((error) => {
        console.error("Error protecting gift quantities:", error);
      });
  };

  // Run on load and after updates
  document.addEventListener("DOMContentLoaded", window.protectGiftQuantities);
  setInterval(window.protectGiftQuantities, 1000);

  // Initialize when DOM is ready
  function initGiftThreshold() {
    document.querySelectorAll(".free-gift-threshold").forEach((section) => {
      if (!section.giftManager) {
        section.giftManager = new FreeGiftManager(section);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGiftThreshold);
  } else {
    initGiftThreshold();
  }

  // Re-initialize on Shopify section reloads
  document.addEventListener("shopify:section:load", (event) => {
    const section = event.target.querySelector(".free-gift-threshold");
    if (section) {
      section.giftManager = new FreeGiftManager(section);
    }
  });

  // Re-initialize on Shopify block select/deselect
  document.addEventListener("shopify:block:select", (event) => {
    const section = event.target.closest(".free-gift-threshold");
    if (section && !section.giftManager) {
      section.giftManager = new FreeGiftManager(section);
    }
  });
})();
