require 'spec_helper'

describe "Posts" do
  describe "View posts" do

    it "sees the blog" do
      visit blog_path

      page.should have_content "The Deev-elopment Blog"
      page.should have_content "posted by deev at"
      page.should have_content "More..."
      page.should have_content "Comments"

      page.should_not have_content "Edit this post"

      page.should have_selector "h3"
      page.should have_selector "article"
      page.should have_selector "img"
      page.should have_selector "time"
    end

    context "admin" do

      it "can edit a post" do
        visit blog_path

        fill_in "Email or Username", with: "deev"
        fill_in "Password", with: "12341234"
        click_button "LOG IN"

        visit blog_path

        page.should have_content "Edit this post"

        click_link "Edit this post"

        within "h3" do
          page.should have_content "Edit Post"
        end
      end
    end

  end
end
