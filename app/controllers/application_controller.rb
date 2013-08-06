class ApplicationController < ActionController::Base
  include ApplicationHelper
  protect_from_forgery

  def auth_only!
    unless as_admin?
      flash = "Access denied"
      redirect_to :root
    end
  end

end
