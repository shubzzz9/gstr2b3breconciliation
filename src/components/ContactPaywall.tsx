interface ContactPaywallProps {
  onClose: () => void;
  exportCount: number;
  maxExports: number;
}

const ContactPaywall = ({ onClose, exportCount, maxExports }: ContactPaywallProps) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="gradient-header text-primary-foreground p-6 text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="text-xl font-bold">Export Limit Reached</h2>
          <p className="text-sm opacity-85 mt-1">
            You've used {exportCount} of {maxExports} free exports
          </p>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm text-foreground leading-relaxed">
            Your free trial exports are exhausted. To continue using the GST Reconciliation Tool, 
            please contact us to get more exports based on your requirements.
          </p>

          <div className="space-y-3">
            <a
              href="mailto:techbharatstudios@gmail.com?subject=GST Tool - Request More Exports"
              className="btn-tool bg-primary text-primary-foreground hover:opacity-90 flex items-center justify-center gap-2"
            >
              📧 Email Us — techbharatstudios@gmail.com
            </a>
            
            <a
              href="https://wa.me/918668606224?text=Hi%2C%20I%20want%20to%20purchase%20more%20exports%20for%20the%20GST%20Reconciliation%20Tool"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-tool bg-success text-success-foreground hover:opacity-90 flex items-center justify-center gap-2"
            >
              💬 WhatsApp Us
            </a>
          </div>

          <div className="alert-box alert-info text-xs">
            <strong>How it works:</strong> Once you contact us and make the payment, we'll increase your 
            export limit within 24 hours. You'll get an email confirmation.
          </div>

          <button
            onClick={onClose}
            className="btn-tool bg-secondary text-foreground border border-border hover:bg-muted w-full"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContactPaywall;
