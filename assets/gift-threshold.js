/**
 * Gift Threshold - Using Shopify Product API
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
    this.sampleHandle = this.section.dataset.sampleHandle;
    this.universalSampleId = this.section.dataset.sampleId;

    console.log("Gift Threshold initialized:", {
      threshold: this.threshold,
      cartTotal: this.cartTotal,
      sampleHandle: this.sampleHandle,
      sampleId: this.universalSampleId,
    });

    if (!this.sampleHandle) {
      console.error("Gift Threshold: No sample product configured");
      return;
    }

    this.selectedProduct = null;
    this.selectedSampleVariantId = null;
    this.sampleProductData = null;
    this.isProcessing = false;
    this.hasSample = undefined;
    this.isValidating = false;
    this.init();
  }

  async init() {
    // Fetch sample product data at initialization
    await this.fetchSampleProduct();

    this.initSearch();
    this.initProductSelection();
    this.initSampleVariantSelection();
    this.initAddButton();
    this.startAmountUpdater();
    this.addEnhancedStyles();
    this.listenForCartUpdates();
    this.checkInitialState();

    console.log("Gift Threshold: Initialization complete");
  }

  async fetchSampleProduct() {
    try {
      const response = await fetch(
        window.Shopify.routes.root + `products/${this.sampleHandle}.js`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch sample product: ${response.status}`);
      }

      this.sampleProductData = await response.json();
      console.log("Sample product data fetched:", this.sampleProductData);

      // Update universalSampleId if needed
      if (
        !this.universalSampleId &&
        this.sampleProductData.variants.length > 0
      ) {
        this.universalSampleId = this.sampleProductData.variants[0].id;
      }
    } catch (error) {
      console.error("Error fetching sample product:", error);
      // Try to continue with the default sample ID if available
      if (this.universalSampleId) {
        console.log("Using default sample ID:", this.universalSampleId);
      }
    }
  }

  async checkInitialState() {
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
      '.gift-threshold__product-card[style=""], .gift-threshold__product-card:not([style*="display"])'
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

    // Handle button clicks for single variant products
    productsGrid.addEventListener("click", (e) => {
      if (e.target.classList.contains("gift-threshold__choose-btn")) {
        e.preventDefault();
        this.handleProductSelect(e.target);
      }
    });

    // Handle variant selection for multi-variant products
    productsGrid.addEventListener("change", (e) => {
      if (e.target.classList.contains("gift-threshold__variant-select")) {
        this.handleVariantSelect(e.target);
      }
    });
  }

  initSampleVariantSelection() {
    const sampleVariantSelect = document.getElementById(
      "sample-variant-select"
    );
    if (!sampleVariantSelect) return;

    sampleVariantSelect.addEventListener("change", (e) => {
      this.selectedSampleVariantId = e.target.value;
      const addButton = document.getElementById("add-sample-btn");

      if (this.selectedSampleVariantId && addButton) {
        addButton.disabled = false;
        addButton.style.animation = "pulse 0.5s ease";
      } else if (addButton) {
        addButton.disabled = true;
      }
    });
  }

  handleProductSelect(button) {
    if (this.isProcessing) return;

    const card = button.closest(".gift-threshold__product-card");
    const productImage = card.querySelector(".gift-threshold__product-image");

    let imageUrl = "";
    let imageAlt = "";

    if (productImage) {
      if (productImage.tagName === "IMG") {
        imageUrl = productImage.src;
        imageAlt = productImage.alt || "";
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

    console.log("Product selected:", this.selectedProduct);
    this.updateSelectedProductDisplay();
    this.updateCardSelection(card);
    this.loadSampleVariants();
    this.scrollToSelected();
  }

  handleVariantSelect(select) {
    if (this.isProcessing) return;

    // If placeholder selected, clear selection
    if (!select.value) {
      const card = select.closest(".gift-threshold__product-card");
      card.classList.remove("selected");
      const selectedDiv = document.getElementById("selected-product");
      if (selectedDiv) {
        selectedDiv.style.display = "none";
      }
      this.selectedProduct = null;
      this.selectedSampleVariantId = null;
      return;
    }

    const card = select.closest(".gift-threshold__product-card");
    const option = select.options[select.selectedIndex];
    const productImage = card.querySelector(".gift-threshold__product-image");

    let imageUrl = "";
    let imageAlt = "";

    if (productImage) {
      if (productImage.tagName === "IMG") {
        imageUrl = productImage.src;
        imageAlt = productImage.alt || "";
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

    console.log("Variant selected:", this.selectedProduct);
    this.updateSelectedProductDisplay();
    this.updateCardSelection(card);
    this.loadSampleVariants();
    this.scrollToSelected();
  }

  updateSelectedProductDisplay() {
    const selectedDiv = document.getElementById("selected-product");
    const selectedInfo = document.getElementById("selected-info");

    if (!selectedDiv || !this.selectedProduct) return;

    // Create product info display
    if (selectedInfo) {
      selectedInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
          ${
            this.selectedProduct.imageUrl
              ? `
            <img src="${this.selectedProduct.imageUrl}" 
                 alt="${this.selectedProduct.imageAlt}"
                 style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 2px solid #10b981;">
          `
              : ""
          }
          <div>
            <strong style="color: #065f46; font-size: 16px;">${
              this.selectedProduct.title
            }</strong>
            ${
              this.selectedProduct.variantTitle !== "Default"
                ? `
              <div style="color: #6b7280; font-size: 14px; margin-top: 4px;">
                Wariant: ${this.selectedProduct.variantTitle}
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
    }

    // Show the selected product section
    selectedDiv.style.display = "block";
    selectedDiv.style.animation = "slideUp 0.5s ease";
  }

  async loadSampleVariants() {
    const sampleVariantSection = document.getElementById(
      "sample-variant-section"
    );
    const sampleVariantSelect = document.getElementById(
      "sample-variant-select"
    );
    const addButton = document.getElementById("add-sample-btn");

    // If we don't have sample product data yet, try to fetch it
    if (!this.sampleProductData && this.sampleHandle) {
      await this.fetchSampleProduct();
    }

    if (!this.sampleProductData || !this.sampleProductData.variants) {
      // No sample data, just enable the add button with default ID
      if (addButton) {
        addButton.disabled = !this.universalSampleId;
      }
      this.selectedSampleVariantId = this.universalSampleId;

      if (sampleVariantSection) {
        sampleVariantSection.style.display = "none";
      }
      return;
    }

    if (!sampleVariantSection || !sampleVariantSelect) {
      // Elements not found but we have data, use first available variant
      const availableVariant = this.sampleProductData.variants.find(
        (v) => v.available
      );
      this.selectedSampleVariantId = availableVariant
        ? availableVariant.id
        : this.universalSampleId;
      if (addButton) {
        addButton.disabled = !this.selectedSampleVariantId;
      }
      return;
    }

    // Show the sample variant section
    sampleVariantSection.style.display = "block";
    sampleVariantSelect.disabled = false;

    // Clear and populate the select
    sampleVariantSelect.innerHTML =
      '<option value="">Wybierz rozmiar próbki...</option>';

    // Add available variants from sample product data
    let availableVariants = [];
    this.sampleProductData.variants.forEach((variant) => {
      if (variant.available) {
        const option = document.createElement("option");
        option.value = variant.id;
        option.textContent = variant.title || `Wariant ${variant.id}`;
        sampleVariantSelect.appendChild(option);
        availableVariants.push(variant);
      }
    });

    console.log(`Loaded ${availableVariants.length} available sample variants`);

    if (availableVariants.length === 0) {
      // No available variants
      sampleVariantSection.style.display = "none";
      this.selectedSampleVariantId = null;
      if (addButton) {
        addButton.disabled = true;
      }
      this.showNotification("Brak dostępnych rozmiarów próbek", "warning");
    } else if (availableVariants.length === 1) {
      // Auto-select if only one variant
      sampleVariantSelect.value = availableVariants[0].id;
      this.selectedSampleVariantId = availableVariants[0].id;
      if (addButton) {
        addButton.disabled = false;
      }
    } else {
      // Multiple variants - require selection
      if (addButton) {
        addButton.disabled = true;
      }
    }
  }

  updateCardSelection(selectedCard) {
    document
      .querySelectorAll(".gift-threshold__product-card")
      .forEach((card) => {
        if (card !== selectedCard) {
          card.classList.remove("selected");
          // Reset variant select if exists
          const variantSelect = card.querySelector(
            ".gift-threshold__variant-select"
          );
          if (variantSelect) {
            variantSelect.value = "";
          }
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

    const variantIdToAdd =
      this.selectedSampleVariantId || this.universalSampleId;

    if (!variantIdToAdd) {
      this.showNotification("Proszę wybrać rozmiar próbki", "error");
      return;
    }

    const addButton = document.getElementById("add-sample-btn");
    const originalText = addButton ? addButton.textContent : "";

    try {
      this.isProcessing = true;

      if (addButton) {
        addButton.disabled = true;
        addButton.innerHTML =
          '<span class="gift-threshold__loading">Dodawanie...</span>';
      }

      await this.checkAndRemoveExistingSample();

      const formData = new FormData();
      formData.append("id", variantIdToAdd);
      formData.append("quantity", "1");

      // Add all the properties
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

      if (this.selectedProduct.imageUrl) {
        formData.append(
          "properties[_selected_product_image]",
          this.selectedProduct.imageUrl
        );
        formData.append(
          "properties[_selected_product_image_alt]",
          this.selectedProduct.imageAlt
        );
      }

      // Create display text
      let displayText = `${this.selectedProduct.title}`;
      if (this.selectedProduct.variantTitle !== "Default") {
        displayText += ` - ${this.selectedProduct.variantTitle}`;
      }

      // Add sample variant info if we have it
      if (this.sampleProductData && this.selectedSampleVariantId) {
        const sampleVariant = this.sampleProductData.variants.find(
          (v) => v.id == this.selectedSampleVariantId
        );
        if (sampleVariant && sampleVariant.title) {
          displayText += ` (Próbka: ${sampleVariant.title})`;
        }
      }

      formData.append("properties[Wybrany produkt]", displayText);

      console.log("Adding to cart with variant ID:", variantIdToAdd);

      const response = await fetch("/cart/add.js", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = "Nie udało się dodać próbki do koszyka";
        try {
          const errorData = await response.json();
          console.error("Cart add error:", errorData);

          if (errorData.description) {
            if (errorData.description.includes("sold out")) {
              errorMessage =
                "Wybrany rozmiar próbki jest niedostępny. Wybierz inny rozmiar.";
            } else {
              errorMessage = errorData.description;
            }
          }
        } catch (e) {
          console.error("Error parsing error response:", e);
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log("Sample added successfully:", result);

      this.showNotification("Próbka została dodana do koszyka!", "success");

      if (addButton) {
        addButton.innerHTML = "✔ Dodano!";
        addButton.style.background =
          "linear-gradient(135deg, #4CAF50 0%, #45a049 100%)";
      }

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Error adding sample:", error);
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
      existing.remove();
    }

    const notification = document.createElement("div");
    notification.className = `gift-notification gift-notification--${type}`;

    const icons = {
      success: "✔",
      error: "✗",
      warning: "⚠",
      info: "ℹ",
    };

    notification.innerHTML = `<span style="margin-right: 8px;">${
      icons[type] || ""
    }</span>${message}`;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transform = "translateX(100%)";
      setTimeout(() => notification.remove(), 300);
    }, 5000);

    notification.addEventListener("click", () => {
      notification.remove();
    });
  }

  listenForCartUpdates() {
    document.addEventListener("click", async (e) => {
      const removeButton = e.target.closest(
        'cart-remove-button, .cart-item__remove-button, [href*="cart/change"][href*="quantity=0"]'
      );
      if (removeButton) {
        setTimeout(() => this.validateThreshold(), 800);
      }
    });

    document.addEventListener("change", async (e) => {
      if (e.target.matches('input[name="updates[]"], .quantity__input')) {
        setTimeout(() => this.validateThreshold(), 800);
      }
    });

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch.apply(window, args);
      const url = args[0];

      if (
        url &&
        (url.includes("/cart/change") || url.includes("/cart/update"))
      ) {
        setTimeout(() => this.validateThreshold(), 500);
      }

      return response;
    };
  }

  async validateThreshold() {
    if (this.isValidating) return;

    try {
      this.isValidating = true;

      const response = await fetch("/cart.js");
      const cart = await response.json();

      const currentThresholdReached = cart.total_price >= this.threshold;
      const currentHasSample = cart.items.some(
        (item) => item.properties && item.properties._is_free_sample === "true"
      );

      if (!currentThresholdReached && currentHasSample) {
        const sample = cart.items.find(
          (item) =>
            item.properties && item.properties._is_free_sample === "true"
        );

        if (sample) {
          await fetch("/cart/change.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: sample.key,
              quantity: 0,
            }),
          });

          this.showNotification(
            "Próbka została usunięta (koszyk poniżej progu)",
            "warning"
          );
          setTimeout(() => location.reload(true), 500);
        }
      }

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
    setInterval(() => this.updateAmount(), 2000);
  }

  async updateAmount() {
    try {
      const response = await fetch("/cart.js");
      const cart = await response.json();

      const currentThresholdReached = cart.total_price >= this.threshold;
      const currentHasSample = cart.items.some(
        (item) => item.properties && item.properties._is_free_sample === "true"
      );

      if (!currentThresholdReached && currentHasSample) {
        this.validateThreshold();
        return;
      }

      const remaining = this.threshold - cart.total_price;
      const amountEl = this.section.querySelector(".gift-threshold__amount");
      const progressBar = this.section.querySelector(
        ".gift-threshold__progress-bar"
      );

      if (amountEl && remaining > 0) {
        const formattedAmount = (remaining / 100).toFixed(2).replace(".", ",");
        amountEl.textContent = `${formattedAmount} zł`;
      }

      if (progressBar) {
        const progress = Math.min(
          (cart.total_price / this.threshold) * 100,
          100
        );
        progressBar.style.width = `${progress}%`;
      }

      this.cartTotal = cart.total_price;
    } catch (error) {
      console.error("Error updating amount:", error);
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
        
        .gift-notification--success { background: #10b981; }
        .gift-notification--error { background: #dc2626; }
        .gift-notification--warning { background: #f59e0b; }
        .gift-notification--info { background: #3b82f6; }
        
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
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
