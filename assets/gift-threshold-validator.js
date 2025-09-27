/**
 * Gift Threshold Validator - Fixed Multiple Notifications
 * File: assets/gift-threshold-validator.js
 */

class GiftThresholdValidator {
  constructor() {
    this.threshold = null;
    this.isValidating = false;
    this.lastKnownState = null;
    this.checkInterval = null;
    this.isRefreshing = false; // Prevent multiple refreshes
    this.notificationShown = false; // Track if notification was shown
    this.init();
  }

  init() {
    const section = document.querySelector(".gift-threshold");
    if (section) {
      this.threshold = parseInt(section.dataset.threshold);
      console.log(
        "Gift Threshold Validator initialized with threshold:",
        this.threshold / 100,
        "PLN"
      );
    }

    if (!this.threshold) return;

    // Store initial state
    this.lastKnownState = this.getCurrentState();

    this.startMonitoring();
    this.interceptCartChanges();
    setTimeout(() => this.checkCart(), 100);
  }

  getCurrentState() {
    const section = document.querySelector(".gift-threshold");
    if (!section) return null;

    return {
      state: section.dataset.state,
      cartTotal: parseInt(section.dataset.cartTotal),
    };
  }

  async checkCart() {
    if (this.isValidating || !this.threshold || this.isRefreshing) return;

    try {
      this.isValidating = true;

      const response = await fetch("/cart.js", {
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response.ok) throw new Error("Failed to fetch cart");

      const cart = await response.json();

      // Find any free sample in cart
      const sampleItem = cart.items.find(
        (item) => item.properties && item.properties._is_free_sample === "true"
      );

      // Determine what state we should be in
      let shouldBeState;
      if (sampleItem) {
        shouldBeState = "success";
      } else if (cart.total_price >= this.threshold) {
        shouldBeState = "selector";
      } else {
        shouldBeState = "info";
      }

      // Get current displayed state
      const currentState = this.lastKnownState
        ? this.lastKnownState.state
        : null;

      // Check if we need to change states
      const needsStateChange = currentState !== shouldBeState;

      // Remove sample if below threshold
      if (sampleItem && cart.total_price < this.threshold) {
        if (!this.isRefreshing) {
          console.log("Removing sample - below threshold");
          this.isRefreshing = true;
          await this.removeSample(sampleItem);
        }
        return;
      }

      // If state needs to change and we haven't started refresh yet
      if (needsStateChange && !this.isRefreshing) {
        console.log(`State change needed: ${currentState} -> ${shouldBeState}`);
        this.isRefreshing = true; // Set flag immediately

        if (shouldBeState === "selector" && currentState === "info") {
          if (!this.notificationShown) {
            this.showNotification(
              "🎉 Próg osiągnięty! Odświeżanie strony...",
              "success"
            );
            this.notificationShown = true;
          }
        } else if (shouldBeState === "info" && currentState === "selector") {
          if (!this.notificationShown) {
            this.showNotification(
              "Koszyk poniżej progu. Odświeżanie...",
              "warning"
            );
            this.notificationShown = true;
          }
        }

        // Refresh after short delay
        setTimeout(() => {
          window.location.reload();
        }, 1000);
        return;
      }

      // Reset notification flag if state is stable
      if (!needsStateChange && this.notificationShown) {
        this.notificationShown = false;
      }

      // Update dynamic elements without refresh
      this.updateDynamicUI(cart.total_price);
    } catch (error) {
      console.error("Cart validation error:", error);
    } finally {
      this.isValidating = false;
    }
  }

  async removeSample(sampleItem) {
    try {
      const response = await fetch("/cart/change.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          id: sampleItem.key,
          quantity: 0,
        }),
      });

      if (response.ok) {
        if (!this.notificationShown) {
          this.showNotification(
            "Próbka została usunięta - koszyk poniżej progu",
            "warning"
          );
          this.notificationShown = true;
        }
        setTimeout(() => window.location.reload(), 500);
      }
    } catch (error) {
      console.error("Error removing sample:", error);
      this.isRefreshing = false; // Reset on error
    }
  }

  updateDynamicUI(cartTotal) {
    // Update progress bar
    const progressBar = document.querySelector(".gift-threshold__progress-bar");
    if (progressBar) {
      const percentage = Math.min((cartTotal / this.threshold) * 100, 100);
      progressBar.style.width = `${percentage}%`;
    }

    // Update amount
    const amountEl = document.querySelector(".gift-threshold__amount");
    if (amountEl && cartTotal < this.threshold) {
      const remaining = this.threshold - cartTotal;
      amountEl.textContent = new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
      }).format(remaining / 100);
    }

    // Update progress info
    const progressInfo = document.querySelector(
      ".gift-threshold__progress-info"
    );
    if (progressInfo) {
      const percentage = Math.round((cartTotal / this.threshold) * 100);

      if (cartTotal >= this.threshold) {
        progressInfo.innerHTML = `
          <span style="color: #10b981; font-weight: 600;">✓ Próg osiągnięty!</span>
          <span style="color: #10b981; font-weight: 600;">Możesz wybrać próbkę</span>
        `;
      } else {
        const remaining = this.threshold - cartTotal;
        progressInfo.innerHTML = `
          <span>${percentage}% do darmowej próbki</span>
          <span style="font-weight: 600;">Brakuje: ${new Intl.NumberFormat(
            "pl-PL",
            {
              style: "currency",
              currency: "PLN",
            }
          ).format(remaining / 100)}</span>
        `;
      }
    }
  }

  showNotification(message, type = "info") {
    // Remove any existing notifications
    const existing = document.querySelectorAll(".gift-notification");
    existing.forEach((el) => el.remove());

    const notification = document.createElement("div");
    notification.className = "gift-notification";
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      z-index: 99999;
      max-width: 320px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      cursor: pointer;
      background: ${
        type === "warning"
          ? "#f59e0b"
          : type === "success"
          ? "#10b981"
          : "#3b82f6"
      };
      animation: slideIn 0.3s ease;
    `;

    notification.innerHTML = message;
    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification && notification.parentNode) {
        notification.style.opacity = "0";
        setTimeout(() => {
          if (notification && notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 3000);

    notification.onclick = () => notification.remove();
  }

  startMonitoring() {
    // Check less frequently to reduce duplicate notifications
    this.checkInterval = setInterval(() => this.checkCart(), 1500);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // Reset flags when tab becomes visible
        this.isRefreshing = false;
        this.notificationShown = false;
        this.checkCart();
      }
    });
  }

  interceptCartChanges() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch.apply(window, args);
      const url = args[0];

      if (typeof url === "string" && url.includes("/cart/")) {
        // Reset notification flag on cart changes
        this.notificationShown = false;
        setTimeout(() => this.checkCart(), 100);
      }

      return response;
    };

    // Listen for cart form changes
    document.addEventListener("change", (e) => {
      if (
        e.target.matches(
          'input[name="updates[]"], .quantity__input, [name="quantity"]'
        )
      ) {
        this.notificationShown = false;
        setTimeout(() => this.checkCart(), 500);
      }
    });
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

// Initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.giftValidator = new GiftThresholdValidator();
  });
} else {
  window.giftValidator = new GiftThresholdValidator();
}

// Re-initialize on Shopify section reload (theme editora)
document.addEventListener("shopify:section:load", () => {
  if (window.giftValidator) {
    window.giftValidator.destroy();
  }
  window.giftValidator = new GiftThresholdValidator();
});
