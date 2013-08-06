class ApplicationController < ActionController::Base
  protect_from_forgery

  def auth_only!
    unless current_user.admin
      flash = "Access denied"
      redirect_to :root
    end
  end

end
