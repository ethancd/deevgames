module ApplicationHelper
  def as_admin?
    user_signed_in? && current_user.admin
  end
end
