/**
 * Gift Threshold - Complete with Duplicate Prevention and Auto-Remove
 * File: assets/gift-threshold.js
 */

class GiftThreshold {
  constructor() {
    this.section = document.querySelector(".gift-threshold");
    if (!this.section) {
      console.log("Gift Threshold: Section not found");
      return;
    }

    this.threshold = parseInt(this.section.dataset.threshold);
    this.cartTotal = parseInt(this.section.dataset.cartTotal);
    this.universalSampleId = this.section.dataset.sampleId;

    console.log("Gift Threshold initialized:", {
      threshold: this.threshold,
      cartTotal: this.cartTotal,
      sampleId: this.universalSampleId,
    });

    // Validate configuration
    if (
      !this.universalSampleId ||
      this.universalSampleId === "null" ||
      this.universalSampleId === ""
    ) {
      console.error("Gift Threshold: No sample variant ID configured");
      return;
    }

    this.selectedProduct = null;
    this.isProcessing = false;
    this.hasSample = undefined; // Track if cart has sample
    this.isValidating = false; // Prevent multiple simultaneous validations
    this.init();
  }

  init() {
    this.initSearch();
    this.initProductSelection();
    this.initAddButton();
    this.startAmountUpdater();
    this.addEnhancedStyles();
    this.listenForCartUpdates();
    this.checkInitialState();

    console.log("Gift Threshold: Initialization complete");
  }

  async checkInitialState() {
    // Check cart state on page load
    try {
      const response = await fetch("/cart.js");
      const cart = await response.json();

      const hasSample = cart.items.some(
        (item) => item.properties && item.properties._is_free_sample === "true"
      );

      this.hasSample = hasSample;
      this.cartTotal = cart.total_price;

      console.log("Initial state:", {
        hasSample: this.hasSample,
        cartTotal: this.cartTotal,
        threshold: this.threshold,
      });

      // Immediately validate threshold on page load
      await this.validateThreshold();
    } catch (error) {
      console.error("Error checking initial state:", error);
    }
  }

  initSearch() {
    const searchInput = document.getElementById("product-search");
    if (!searchInput) return;

    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      const products = document.querySelectorAll(
        ".gift-threshold__product-card"
      );

      products.forEach((product) => {
        const title = product.dataset.productTitle.toLowerCase();
        const shouldShow = query === "" || title.includes(query);

        if (shouldShow) {
          product.style.display = "";
          product.style.animation = "fadeIn 0.3s ease";
        } else {
          product.style.display = "none";
        }
      });

      this.handleNoResults(query);
    });
  }

  handleNoResults(query) {
    const grid = document.getElementById("products-list");
    if (!grid) return;

    const visibleProducts = grid.querySelectorAll(
      '.gift-threshold__product-card[style=""], .gift-threshold__product-card:not([style])'
    );

    let noResultsMsg = grid.querySelector(".no-results-message");

    if (visibleProducts.length === 0 && query.trim() !== "") {
      if (!noResultsMsg) {
        noResultsMsg = document.createElement("div");
        noResultsMsg.className = "no-results-message";
        noResultsMsg.style.cssText = `
          grid-column: 1 / -1;
          text-align: center;
          padding: 40px;
          color: #666;
          font-size: 16px;
        `;
        noResultsMsg.textContent = `Nie znaleziono produktów dla "${query}"`;
        grid.appendChild(noResultsMsg);
      }
    } else if (noResultsMsg) {
      noResultsMsg.remove();
    }
  }

  initProductSelection() {
    const productsGrid = document.getElementById("products-list");
    if (!productsGrid) return;

    productsGrid.addEventListener("click", (e) => {
      if (e.target.classList.contains("gift-threshold__choose-btn")) {
        e.preventDefault();
        this.handleProductSelect(e.target);
      }
    });

    productsGrid.addEventListener("change", (e) => {
      if (e.target.classList.contains("gift-threshold__variant-select")) {
        this.handleVariantSelect(e.target);
      }
    });
  }

  handleProductSelect(button) {
    if (this.isProcessing) return;

    const originalText = button.textContent;
    button.textContent = "Wybieranie...";
    button.disabled = true;

    setTimeout(() => {
      const card = button.closest(".gift-threshold__product-card");
      const productImage = card.querySelector(".gift-threshold__product-image");

      // Extract image information
      let imageUrl = "";
      let imageAlt = "";

      if (productImage) {
        if (productImage.tagName === "IMG") {
          imageUrl = productImage.src;
          imageAlt = productImage.alt || "";
        } else {
          const bgImage = window.getComputedStyle(productImage).backgroundImage;
          if (bgImage && bgImage !== "none") {
            imageUrl = bgImage.slice(5, -2);
          }
        }
      }

      this.selectedProduct = {
        title: button.dataset.product,
        variantId: button.dataset.variantId,
        variantTitle: button.dataset.variantTitle || "Default",
        handle: card.dataset.productHandle || "",
        imageUrl: imageUrl,
        imageAlt: imageAlt || button.dataset.product,
      };

      console.log("Selected product with image:", this.selectedProduct);

      this.updateSelectedProductDisplay();
      this.updateCardSelection(card);

      button.textContent = originalText;
      button.disabled = false;

      this.scrollToSelected();
    }, 300);
  }

  handleVariantSelect(select) {
    if (this.isProcessing || !select.value) return;

    const card = select.closest(".gift-threshold__product-card");
    const option = select.options[select.selectedIndex];
    const productImage = card.querySelector(".gift-threshold__product-image");

    let imageUrl = "";
    let imageAlt = "";

    if (productImage) {
      if (productImage.tagName === "IMG") {
        imageUrl = productImage.src;
        imageAlt = productImage.alt || "";
      } else {
        const bgImage = window.getComputedStyle(productImage).backgroundImage;
        if (bgImage && bgImage !== "none") {
          imageUrl = bgImage.slice(5, -2);
        }
      }
    }

    this.selectedProduct = {
      title: card.dataset.productTitle,
      variantId: select.value,
      variantTitle: option.dataset.title || option.textContent.trim(),
      handle: card.dataset.productHandle || "",
      imageUrl: imageUrl,
      imageAlt: imageAlt || card.dataset.productTitle,
    };

    this.updateSelectedProductDisplay();
    this.updateCardSelection(card);
    this.scrollToSelected();
  }

  updateSelectedProductDisplay() {
    const selectedDiv = document.getElementById("selected-product");
    const selectedName = document.getElementById("selected-name");
    const addButton = document.getElementById("add-sample-btn");

    if (!selectedDiv || !selectedName || !this.selectedProduct) return;

    selectedName.textContent = `${this.selectedProduct.title} - ${this.selectedProduct.variantTitle}`;

    selectedDiv.style.display = "block";
    selectedDiv.style.animation = "slideUp 0.5s ease";

    if (addButton) {
      addButton.disabled = false;
      addButton.style.animation = "pulse 0.5s ease";
    }
  }

  updateCardSelection(selectedCard) {
    document
      .querySelectorAll(".gift-threshold__product-card")
      .forEach((card) => {
        if (card !== selectedCard) {
          card.classList.remove("selected");
          card.style.transform = "";
        }
      });

    if (selectedCard) {
      selectedCard.classList.add("selected");
      selectedCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  scrollToSelected() {
    const selectedDiv = document.getElementById("selected-product");
    if (selectedDiv && selectedDiv.style.display !== "none") {
      setTimeout(() => {
        selectedDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }

  initAddButton() {
    const addButton = document.getElementById("add-sample-btn");
    if (!addButton) return;

    addButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.addSampleToCart();
    });
  }

  async checkAndRemoveExistingSample() {
    try {
      const response = await fetch("/cart.js");
      const cart = await response.json();

      const existingSample = cart.items.find(
        (item) => item.properties && item.properties._is_free_sample === "true"
      );

      if (existingSample) {
        console.log("Removing existing sample:", existingSample);

        const removeResponse = await fetch("/cart/change.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existingSample.key,
            quantity: 0,
          }),
        });

        if (!removeResponse.ok) {
          console.error("Failed to remove existing sample");
          return false;
        }

        console.log("Existing sample removed successfully");
        return true;
      }

      return true;
    } catch (error) {
      console.error("Error checking/removing existing sample:", error);
      return false;
    }
  }

  async addSampleToCart() {
    if (this.isProcessing) return;

    if (!this.selectedProduct) {
      this.showNotification("Proszę wybrać produkt", "error");
      return;
    }

    if (!this.universalSampleId) {
      this.showNotification(
        "Błąd konfiguracji - brak produktu próbki",
        "error"
      );
      return;
    }

    const addButton = document.getElementById("add-sample-btn");
    const originalText = addButton ? addButton.textContent : "";

    try {
      this.isProcessing = true;

      if (addButton) {
        addButton.disabled = true;
        addButton.innerHTML =
          '<span class="gift-threshold__loading">Sprawdzanie...</span>';
      }

      // Remove any existing sample first
      await this.checkAndRemoveExistingSample();

      if (addButton) {
        addButton.innerHTML =
          '<span class="gift-threshold__loading">Dodawanie...</span>';
      }

      const formData = new FormData();
      formData.append("id", this.universalSampleId);
      formData.append("quantity", "1");

      // Add properties with image information
      formData.append("properties[_is_free_sample]", "true");
      formData.append(
        "properties[_selected_product_title]",
        this.selectedProduct.title
      );
      formData.append(
        "properties[_selected_variant_title]",
        this.selectedProduct.variantTitle
      );
      formData.append(
        "properties[_selected_product_handle]",
        this.selectedProduct.handle
      );
      formData.append(
        "properties[_selected_product_image]",
        this.selectedProduct.imageUrl
      );
      formData.append(
        "properties[_selected_product_image_alt]",
        this.selectedProduct.imageAlt
      );
      formData.append(
        "properties[Wybrany produkt]",
        `${this.selectedProduct.title} - ${this.selectedProduct.variantTitle}`
      );

      console.log("Adding to cart with image data");

      const response = await fetch("/cart/add.js", {
        method: "POST",
        body: formData,
      });

      console.log("Cart add response status:", response.status);

      if (!response.ok) {
        let errorMessage = "Nie udało się dodać próbki do koszyka";

        try {
          const errorData = await response.json();
          console.error("Cart add error response:", errorData);

          if (response.status === 422) {
            if (errorData.description) {
              if (
                errorData.description.includes("sold out") ||
                errorData.description.includes("already sold out")
              ) {
                errorMessage =
                  "Produkt próbki jest niedostępny. Sprawdź ustawienia w panelu admina.";
              } else if (
                errorData.description.includes("Cannot find variant")
              ) {
                errorMessage =
                  "Produkt próbki nie został znaleziony. Sprawdź konfigurację sekcji.";
              } else if (errorData.description.includes("can't add more")) {
                errorMessage = "Osiągnięto maksymalną liczbę próbek";
              } else {
                errorMessage = `Błąd: ${errorData.description}`;
              }
            }
          } else if (response.status === 404) {
            errorMessage = "Produkt próbki nie istnieje w sklepie";
          }
        } catch (parseError) {
          console.error("Error parsing error response:", parseError);
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log("Sample successfully added to cart:", result);

      this.showNotification("Próbka została dodana do koszyka!", "success");

      if (addButton) {
        addButton.innerHTML = "✔ Dodano!";
        addButton.style.background =
          "linear-gradient(135deg, #4CAF50 0%, #45a049 100%)";
      }

      setTimeout(() => {
        console.log("Reloading page to update UI");
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Error adding sample to cart:", error);
      this.showNotification(error.message, "error");

      if (addButton) {
        addButton.disabled = false;
        addButton.textContent = originalText;
        addButton.style.background = "";
      }
    } finally {
      this.isProcessing = false;
    }
  }

  showNotification(message, type = "info") {
    const existing = document.querySelector(".gift-notification");
    if (existing) {
      existing.style.opacity = "0";
      existing.style.transform = "translateX(100%)";
      setTimeout(() => existing.remove(), 300);
    }

    const notification = document.createElement("div");
    notification.className = `gift-notification gift-notification--${type}`;
    notification.textContent = message;

    const icons = {
      success: "✔",
      error: "✗",
      warning: "⚠",
      info: "ℹ",
    };

    if (icons[type]) {
      notification.innerHTML = `<span style="margin-right: 8px;">${icons[type]}</span>${message}`;
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = "0";
        notification.style.transform = "translateX(100%)";
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 5000);

    notification.addEventListener("click", () => {
      notification.style.opacity = "0";
      notification.style.transform = "translateX(100%)";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    });
  }

  listenForCartUpdates() {
    // Listen for remove button clicks specifically
    document.addEventListener("click", async (e) => {
      const removeButton = e.target.closest(
        'cart-remove-button, .cart-item__remove-button, [href*="cart/change"][href*="quantity=0"]'
      );
      if (removeButton) {
        console.log("Remove button clicked, validating immediately");
        // Immediate validation after a short delay
        setTimeout(() => {
          this.validateThreshold();
        }, 800);
      }
    });

    // Listen for quantity changes
    document.addEventListener("change", async (e) => {
      if (e.target.matches('input[name="updates[]"], .quantity__input')) {
        console.log("Quantity changed, validating immediately");
        setTimeout(() => {
          this.validateThreshold();
        }, 800);
      }
    });

    // Listen for form submissions
    document.addEventListener("submit", (e) => {
      if (e.target.matches('form[action*="/cart"]')) {
        console.log("Cart form submitted, will validate");
        setTimeout(() => {
          this.validateThreshold();
        }, 1000);
      }
    });

    // Monitor for fetch requests to cart endpoints
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch.apply(window, args);
      const url = args[0];

      if (
        url &&
        (url.includes("/cart/change") ||
          url.includes("/cart/update") ||
          url.includes("/cart/add"))
      ) {
        console.log("Cart API call detected, validating threshold");
        // Give the cart time to update
        setTimeout(() => {
          this.validateThreshold();
        }, 500);
      }

      return response;
    };

    // Listen for Shopify cart events
    document.addEventListener("cart:updated", () => {
      console.log("cart:updated event detected");
      this.validateThreshold();
    });

    document.addEventListener("ajaxCart:updated", () => {
      console.log("ajaxCart:updated event detected");
      this.validateThreshold();
    });
  }

  async revalidateThreshold() {
    // This is now a wrapper for validateThreshold
    await this.validateThreshold();
  }

  async validateThreshold() {
    // Prevent multiple simultaneous validations
    if (this.isValidating) {
      console.log("Validation already in progress, skipping");
      return;
    }

    try {
      this.isValidating = true;

      const response = await fetch("/cart.js");
      const cart = await response.json();

      const currentThresholdReached = cart.total_price >= this.threshold;
      const currentHasSample = cart.items.some(
        (item) => item.properties && item.properties._is_free_sample === "true"
      );

      console.log("Validating threshold:", {
        currentThresholdReached,
        currentHasSample,
        cartTotal: cart.total_price,
        threshold: this.threshold,
      });

      // CRITICAL: If cart is below threshold but sample exists, remove it immediately
      if (!currentThresholdReached && currentHasSample) {
        const sample = cart.items.find(
          (item) =>
            item.properties && item.properties._is_free_sample === "true"
        );

        if (sample) {
          console.log("Cart below threshold, removing sample immediately");

          const removeResponse = await fetch("/cart/change.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: sample.key,
              quantity: 0,
            }),
          });

          if (removeResponse.ok) {
            this.showNotification(
              "Próbka została usunięta (koszyk poniżej progu)",
              "warning"
            );

            // Force immediate page reload
            setTimeout(() => {
              location.reload(true);
            }, 500);
            return;
          }
        }
      }

      // Check if sample was manually removed while threshold still met
      const sampleWasRemoved =
        this.hasSample === true && currentHasSample === false;

      if (sampleWasRemoved && currentThresholdReached) {
        console.log("Sample was manually removed, reloading to show selector");
        this.showNotification("Możesz wybrać nową próbkę", "info");

        setTimeout(() => {
          location.reload(true);
        }, 500);
        return;
      }

      // Check if threshold was just reached
      if (
        currentThresholdReached &&
        !currentHasSample &&
        !this.section.querySelector(".gift-threshold__selector")
      ) {
        console.log("Threshold reached, reloading to show selector");

        setTimeout(() => {
          location.reload(true);
        }, 500);
        return;
      }

      // Update state
      this.cartTotal = cart.total_price;
      this.hasSample = currentHasSample;
    } catch (error) {
      console.error("Error validating threshold:", error);
    } finally {
      this.isValidating = false;
    }
  }

  async startAmountUpdater() {
    await this.updateAmount();
    // Update amount display every 2 seconds
    setInterval(() => {
      this.updateAmount();
    }, 2000);
  }

  async updateAmount() {
    try {
      const response = await fetch("/cart.js");
      if (!response.ok) {
        throw new Error("Failed to fetch cart data");
      }

      const cart = await response.json();

      // Always validate threshold when updating amount
      const currentThresholdReached = cart.total_price >= this.threshold;
      const currentHasSample = cart.items.some(
        (item) => item.properties && item.properties._is_free_sample === "true"
      );

      // If conditions don't match, trigger validation immediately
      if (!currentThresholdReached && currentHasSample) {
        console.log("Detected threshold violation during amount update");
        this.validateThreshold();
        return; // Stop updating UI as page will reload
      }

      const remaining = this.threshold - cart.total_price;
      const amountEl = this.section.querySelector(".gift-threshold__amount");
      const progressBar = this.section.querySelector(
        ".gift-threshold__progress-bar"
      );
      const progressContainer = this.section.querySelector(
        ".gift-threshold__progress"
      );
      const messageEl = this.section.querySelector(".gift-threshold__message");

      // Update remaining amount
      if (amountEl && remaining > 0) {
        const formattedAmount = (remaining / 100).toFixed(2).replace(".", ",");
        const newText = `${formattedAmount} zł`;

        if (amountEl.textContent !== newText) {
          amountEl.style.transform = "scale(1.1)";
          amountEl.textContent = newText;
          setTimeout(() => {
            amountEl.style.transform = "scale(1)";
          }, 200);
        }
      }

      // Update progress bar
      if (progressBar) {
        const progress = Math.min(
          (cart.total_price / this.threshold) * 100,
          100
        );
        progressBar.style.width = `${progress}%`;

        // Keep consistent green gradient for filled portion
        progressBar.style.background =
          "linear-gradient(90deg, #22c55e, #16a34a)";
      }

      // Set orange background for progress container if not already set
      if (progressContainer && !progressContainer.style.background) {
        progressContainer.style.background = "#fb923c"; // Orange background for unfilled portion
      }

      // Update or create progress info element
      let progressInfoEl = this.section.querySelector(
        ".gift-threshold__progress-info"
      );

      if (!progressInfoEl && progressContainer) {
        progressInfoEl = document.createElement("div");
        progressInfoEl.className = "gift-threshold__progress-info";
        progressInfoEl.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
          font-size: 14px;
          color: #6b7280;
        `;
        progressContainer.insertAdjacentElement("afterend", progressInfoEl);
      }

      const progressPercent = Math.min(
        Math.round((cart.total_price / this.threshold) * 100),
        100
      );

      if (progressInfoEl) {
        if (progressPercent >= 100) {
          progressInfoEl.innerHTML = `
            <span style="color: #10b981; font-weight: 600;">🎉 Próg osiągnięty! 100%</span>
            <span style="color: #10b981; font-weight: 600;">Możesz wybrać próbkę!</span>
          `;
        } else {
          const remainingFormatted = (remaining / 100)
            .toFixed(2)
            .replace(".", ",");
          progressInfoEl.innerHTML = `
            <span>${progressPercent}% do darmowej próbki</span>
            <span style="font-weight: 600;">Brakuje: ${remainingFormatted} zł</span>
          `;
        }
      }

      // Update message based on progress
      if (messageEl && remaining > 0) {
        if (remaining <= 2000) {
          // Less than 20 PLN
          messageEl.innerHTML = `Już prawie! Dodaj produkty za <span class="gift-threshold__amount">${(
            remaining / 100
          )
            .toFixed(2)
            .replace(".", ",")} zł</span> aby otrzymać darmową próbkę! 🎁`;
        } else if (remaining <= 5000) {
          // Less than 50 PLN
          messageEl.innerHTML = `Blisko! Dodaj produkty za <span class="gift-threshold__amount">${(
            remaining / 100
          )
            .toFixed(2)
            .replace(".", ",")} zł</span> aby otrzymać darmową próbkę!`;
        }
      }

      const wasReached = this.cartTotal >= this.threshold;
      const isReached = cart.total_price >= this.threshold;

      if (wasReached !== isReached) {
        setTimeout(() => {
          window.location.reload();
        }, 500);
        return;
      }

      this.cartTotal = cart.total_price;
    } catch (error) {
      console.error("Error updating cart amount:", error);
    }
  }

  addEnhancedStyles() {
    if (!document.querySelector("#gift-threshold-enhanced-styles")) {
      const style = document.createElement("style");
      style.id = "gift-threshold-enhanced-styles";
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .gift-threshold__amount {
          transition: transform 0.2s ease;
        }
        
        .gift-threshold__progress {
          position: relative;
          overflow: hidden;
        }
        
        .gift-threshold__progress-bar {
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease;
          position: relative;
          overflow: hidden;
        }
        
        .gift-threshold__progress-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.3),
            transparent
          );
          animation: shimmer 2s infinite;
        }
        
        .no-results-message {
          animation: fadeIn 0.3s ease;
        }
        
        .gift-threshold__button {
          transition: all 0.3s ease;
        }
        
        .gift-threshold__loading::after {
          content: "";
          width: 16px;
          height: 16px;
          margin-left: 8px;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          display: inline-block;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .gift-notification {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 16px 20px;
          border-radius: 8px;
          color: #ffffff;
          font-weight: 600;
          z-index: 99999;
          max-width: 320px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          animation: slideInRight 0.3s ease;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .gift-notification--success {
          background: #10b981;
        }
        
        .gift-notification--error {
          background: #dc2626;
        }
        
        .gift-notification--warning {
          background: #f59e0b;
        }
        
        .gift-notification--info {
          background: #3b82f6;
        }
        
        .gift-notification:hover {
          transform: translateX(-5px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
        }
        
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .gift-threshold__progress-info {
          font-weight: 600;
          transition: color 0.3s ease;
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// Initialize when DOM is ready
function initGiftThreshold() {
  try {
    new GiftThreshold();
  } catch (error) {
    console.error("Error initializing Gift Threshold:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGiftThreshold);
} else {
  initGiftThreshold();
}
