class ApplicationController < ActionController::Base
  protect_from_forgery

  def kick_if_not_allowed!
    redirect_to :root unless current_user.admin
  end
end
